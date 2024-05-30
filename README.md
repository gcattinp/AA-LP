# Safe-NEETH

This typescript project uses [`permissionless`](https://docs.pimlico.io/permissionless) and [viem](https://viem.sh/) libraries to create SAFE Smart Accounts that are compatible with ERC4337 and perform transactions on Arbitrum using NEETH as a paymaster, using Pimilco as the bundler.

## Features
* **Account Creation:** Automatically generates a new private key or uses an existing EOA to create a Smart Account.
* **NEETH Paymaster:** It verifies the total amount of NEETH on the Smart Account and then burns the amount used for gas.
* **Pimilco Bundler:** Uses Pimilco as a Bundler to send transactions and handle gas estimations.

## Prerequisites
We suggest using Bun installed:
* [Bun](https://bun.sh/) (follow instructions on their website).

For your .env you will also need:
* API key from [Pimilco](https://dashboard.pimlico.io/apikeys).
* (Optional) A private key for an Ethereum EOA - the script can generate you one if you don't have one.

## Installation

1. Clone the repository
```
git clone git@github.com:NaniDAO/safe-neeth.git
cd safe-neeth
```

2. Install Bun packages
```
bun install
```

3. Set up environment variables
```
PIMLICO_API_KEY=your_pimlico_api_key
PRIVATE_KEY=your_private_key # Optional
```
4. Run the script
```
bun start
```

---
## NEETH

The transaction's gas won't be subsidized unless the deployed Smart Account has a NEETH balance. To do this, you have to call the `deposit` function on NEETH's contract (0x00000000000009B4AB3f1bC2b029bd7513Fbd8ED) with the amount of ETH you want to use for gas. This is then converted into wstETH on Arbitrum and the contract mints NEETH to the `msg.sender` (whoever called the function). So, NEETH erc20 serves as a receipt that an account holds a certain amount of wstETH in a contract, this wstETH will then me swapped back to ETH by the paymaster and used to pay for transactions, burning the equivalent NEETH from the account. Which is why it's important that the Smart Account holds enough NEETH.

In essence, this makes transactions free-ish, since the yield generated by the LST (in this case wrapped stETH) is used to pay for gas on any transaction generated by the Smart Account.
