import { ENTRYPOINT_ADDRESS_V07, createSmartAccountClient, getRequiredPrefund, type UserOperation } from "permissionless";
import { signerToSafeSmartAccount } from "permissionless/accounts";
import {
  createPimlicoBundlerClient,
  createPimlicoPaymasterClient,
} from "permissionless/clients/pimlico";
import { createPublicClient, http, parseEther, getContract, type Hex, erc20Abi, type Address, createWalletClient, stringToHex, encodeFunctionData, parseGwei } from "viem";
import { arbitrum } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { neethAbi, uniswapV3Abi } from "./abis";

const NEETH_ADDRESS = "0x00000000000009B4AB3f1bC2b029bd7513Fbd8ED" as const;
const FACTORY_ADDRESS = "0x814A743B2E5727BF7f833816ad2C092BF9218a7E" as const;
const TOKEN_ADDRESS = "0xAFeA1838550e27E7415FE214633F722879fB7Eb4";
const WETH_ADDRESS = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1" as const;
const UNISWAP_V3_ADDRESS = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88" as const;
const API_KEY = process.env.PIMLICO_API_KEY;
const fee = 10000;

function calculateSqrtPriceX96(price: bigint): bigint {
  const sqrtPrice = Math.sqrt(Number(price)) * Math.pow(2, 96);
  return BigInt(Math.floor(sqrtPrice));
}

const priceRatio = 1000000n / 100n; // 10,000
const sqrtPriceX96 = calculateSqrtPriceX96(priceRatio);

console.log('sqrtPriceX96:', sqrtPriceX96.toString());

let PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;

if (!PRIVATE_KEY) {
  PRIVATE_KEY = generatePrivateKey();
}

const pimlicoEndpoint = `https://api.pimlico.io/v2/arbitrum/rpc?apikey=${API_KEY}`;

export const publicClient = createPublicClient({
  transport: http("https://rpc.ankr.com/arbitrum/"),
});

export const paymasterClient = createPimlicoPaymasterClient({
  transport: http(`https://api.pimlico.io/v2/arbitrum/rpc?apikey=${API_KEY}`),
  entryPoint: ENTRYPOINT_ADDRESS_V07,
});

export const pimlicoBundlerClient = createPimlicoBundlerClient({
  transport: http(`https://api.pimlico.io/v2/arbitrum/rpc?apikey=${API_KEY}`),
  entryPoint: ENTRYPOINT_ADDRESS_V07,
});

const signer = privateKeyToAccount(PRIVATE_KEY);

console.log('Signer:', signer.address);

const walletClient = createWalletClient({
  account: signer,
  transport: http("https://rpc.ankr.com/arbitrum/"),
  chain: arbitrum,
});

// Create a SCA SAFE 1.4.1
const safeAccount = await signerToSafeSmartAccount(publicClient, {
  entryPoint: ENTRYPOINT_ADDRESS_V07,
  signer: signer,
  saltNonce: 0n, // optional
  safeVersion: "1.4.1",
  // address:, // optional, only if you are using an already created account
});

console.log('Safe Account:', safeAccount.address);

const smartAccountClient = createSmartAccountClient({
  account: safeAccount,
  entryPoint: ENTRYPOINT_ADDRESS_V07,
  chain: arbitrum,
  bundlerTransport: http(pimlicoEndpoint),
  middleware: {
    gasPrice: async () => (await pimlicoBundlerClient.getUserOperationGasPrice()).fast, // if using pimlico bundler
    sponsorUserOperation: async (args: { userOperation: UserOperation<"v0.7">, entryPoint: Address }) => {
      // getRequiredPrefund
      const requiredPrefund = getRequiredPrefund({
        userOperation: {
          ...args.userOperation,
          paymaster: NEETH_ADDRESS
        },
        entryPoint: ENTRYPOINT_ADDRESS_V07
      });

      console.log('Required Prefund:', requiredPrefund);

      // check neeth balance
      const neethBalance = await publicClient.readContract({
        address: NEETH_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [safeAccount.address]
      });

      console.log('NEETH Balance:', neethBalance);

      if (neethBalance > requiredPrefund) {
        const gasEstimates = await pimlicoBundlerClient.estimateUserOperationGas({
          userOperation: { ...args.userOperation, paymaster: NEETH_ADDRESS },
        });

        console.log('Gas Estimates: (NEETH)', gasEstimates);

        return {
          ...gasEstimates,
          paymaster: NEETH_ADDRESS,
        };
      } else {
        const gasEstimates = await pimlicoBundlerClient.estimateUserOperationGas({
          userOperation: { ...args.userOperation, paymaster: '0x' },
        });

        console.log('Gas Estimates: (ETH)', gasEstimates);

        return {
          ...gasEstimates,
          paymaster: '0x',
        };
      }
    },
  },
});

// Approve token transfer for token and WETH
const approveTokenTx = await smartAccountClient.writeContract({
  address: TOKEN_ADDRESS,
  abi: erc20Abi,
  functionName: 'approve',
  args: [UNISWAP_V3_ADDRESS, 100000000000000000000n], // Approving 100 tokens
  maxFeePerGas: parseGwei('20'),
  maxPriorityFeePerGas: parseGwei('2'),
});

console.log('Approve Token Transaction:', approveTokenTx);

const approveWETHTx = await smartAccountClient.writeContract({
  address: WETH_ADDRESS,
  abi: erc20Abi,
  functionName: 'approve',
  args: [UNISWAP_V3_ADDRESS, 1000000000000000000000n], // Approving 1,000,000 WETH
  maxFeePerGas: parseGwei('20'),
  maxPriorityFeePerGas: parseGwei('2'),
});

console.log('Approve WETH Transaction:', approveWETHTx);

// const wrapETH = await smartAccountClient.writeContract({
//   address: WETH_ADDRESS,
//   abi: neethAbi,
//   functionName: 'deposit',
//   value: 1000000n,
// });

// console.log('Wrap ETH:', wrapETH);

try {
  const createPoolTx = await smartAccountClient.writeContract({
    address: UNISWAP_V3_ADDRESS,
    abi: uniswapV3Abi,
    functionName: 'createAndInitializePoolIfNecessary',
    args: [TOKEN_ADDRESS, WETH_ADDRESS, fee, sqrtPriceX96],
  });

  console.log('Create Pool Transaction:', createPoolTx);
} catch (error) {
  console.error('Error creating pool:', error);
}
