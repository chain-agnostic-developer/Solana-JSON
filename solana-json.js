/*
	Solana JSON module for storing and retrieving data from the Solana blockchain
*/
const solanaWeb3 = require('@solana/web3.js')
const fs = require('fs').promises
const BufferLayout = require('buffer-layout')

const solanaJSON = {
  setupConnection: (network) => {
    const connection = new solanaWeb3.Connection(network)
    return connection
  },

  /**
   * Creates new user account
   *
   * @returns user account
   */
  createUser: async () => {
    const user = new solanaWeb3.Account()
    console.log(new Date(), `New solana account created: ${user.publicKey}`)
    return user
  },

  /**
   * Load a user from provided private key byte buffer array
   *
   * @param {private key buffer array} privateKeyBufferArray
   * @returns loaded solana user account
   */
  loadUser: async (privateKeyBufferArray) => {
    const user = new solanaWeb3.Account(privateKeyBufferArray)
    console.log(new Date(), `Loaded solana account: ${user.publicKey}`)
    return user
  },

  /**
   * Fund the give account by asking airdrop of 2 SOL
   *
   * @param {*} connection web3js connection Object
   * @param {*} account account that needs fund
   */
  fundUser: async (connection, account) => {
    console.log(new Date(), `Requesting airdrop funds... (this will take 30 seconds)`)
    const res = await connection.requestAirdrop(account.publicKey, 4_000_000_000) // 1 SOL = 1,000,000,000 LAMPORTS
    let lamports = 0
    for (let breakCount = 0; breakCount < 100; breakCount += 10) {
      await new Promise((r) => setTimeout(r, 3_000))
      lamports = await connection.getBalance(account.publicKey)
      console.log(
        new Date(),
        `Payer account ${account.publicKey.toBase58()} containing ${(lamports / 1_000_000_000).toFixed(4)}SOL`,
      )
      if (lamports > 1) breakCount = 100
    }
  },

  /**
   * Get BufferLayout object with specified char len
   *
   * @param {*} characterLength character length
   * @returns Buffer layout object
   */
  setDataStructure: (characterLength) => {
    const structure = BufferLayout.struct([BufferLayout.blob(characterLength, 'txt')])
    return structure
  },

  /**
   * Read compile smart contract file, create new account, load smart contract into it,
   * create app account to store data, and transfer some lamports to pay rent/be rent free
   * we create app account with sending a transaction stating programId is the owner of the account
   * and space we want to acquire
   *
   * @param {*} connection 		web3js connection object
   * @param {*} smartContract	solana smart contract object
   * @param {*} payerAccount	account used for paying
   * @returns
   */
  loadProgram: async (connection, smartContract, payerAccount) => {
    // Load the program
    console.log(new Date(), 'Loading program...')

    console.log(new Date(), 'Reading smart contract executable')
    const data = await fs.readFile(smartContract.pathToProgram)

    console.log(new Date(), 'Create new ProgramAccount')
    const programAccount = new solanaWeb3.Account()

    console.log(new Date(), 'BpfLoader loading')
    await solanaWeb3.BpfLoader.load(connection, payerAccount, programAccount, data, solanaWeb3.BPF_LOADER_PROGRAM_ID)

    const programId = programAccount.publicKey
    console.log(new Date(), 'Program loaded to account', programId.toBase58())

    // Create the app account
    const appAccount = new solanaWeb3.Account()
    const appPubkey = appAccount.publicKey
    console.log(new Date(), 'Creating app account', appPubkey.toBase58())
    const space = smartContract.dataLayout.span
    const lamports = 1000000000
    console.log(new Date(), `Transferring ${(lamports / 1000000000).toFixed(4)}SOL`)

    // create a transaction
    console.log(new Date(), 'AppAccount: Creating transaction')
    const transaction = new solanaWeb3.Transaction().add(
      solanaWeb3.SystemProgram.createAccount({
        fromPubkey: payerAccount.publicKey,
        newAccountPubkey: appPubkey,
        lamports,
        space,
        programId,
      }),
    )

    // send the transaction and await for confirmation
    console.log(new Date(), 'AppAccount: Sending transaction and awaiting confirmation', transaction)
    await solanaWeb3.sendAndConfirmTransaction(connection, transaction, [payerAccount, appAccount], {
      commitment: 'singleGossip',
      preflightCommitment: 'singleGossip',
    })
    console.log(new Date(), 'AppAccount: Creation Transaction execution successful')
    return { appAccount, programId }
  },

  /**
   * Send JSON string to smart contract
   *
   * @param {*} connection  web3js connection object
   * @param {*} app         app details object
   * @param {*} jsonString  json string to be stored
   * @returns               confirmation id
   */
  pushJSON: async (connection, app, payerAccount, jsonString) => {
    if (jsonString.length > 996) throw new Error({ e: 'jsonString length greater than 996 chars' })

    // pad string
    const paddedMsg = jsonString.padEnd(1000)
    const buffer = Buffer.from(paddedMsg, 'utf8')

    // create a instruction which is part of a transaction
    const instruction = new solanaWeb3.TransactionInstruction({
      keys: [{ pubkey: app.appAccount.publicKey, isSigner: false, isWritable: true }],
      programId: app.programId,
      data: buffer,
    })

    // send transaction and await for confirmation
    const confirmation = await solanaWeb3.sendAndConfirmTransaction(
      connection,
      new solanaWeb3.Transaction().add(instruction),
      [payerAccount],
      {
        commitment: 'singleGossip',
        preflightCommitment: 'singleGossip',
      },
    )
    console.log(new Date(), `Data has been pushed to ${app.programId}`)
    return confirmation
  },

  /**
   * Get stored json in smart contract
   *
   * @param {*} connection web3js connection object
   * @param {*} appPubKey App account public key
   * @returns
   */
  pullJSON: async (connection, appPubKey) => {
    console.log(new Date(), `Loading data of account '${appPubKey}'`)
    const accountInfo = await connection.getAccountInfo(appPubKey, 'confirmed')
    console.log(new Date(), `AccountInfo of '${appPubKey}'`, accountInfo)
    return Buffer.from(accountInfo.data).toString().substr(4, 1000).trim()
  },

  deploy: async () => {
    console.log('deploying...')
    const connection = solanaJSON.setupConnection('https://devnet.solana.com')
    const payerAccount = await solanaJSON.createUser()
    await solanaJSON.fundUser(connection, payerAccount)
    const smartContract = {
      pathToProgram: './solana-json.so',
      dataLayout: solanaJSON.setDataStructure(1000),
    }
    const app = await solanaJSON.loadProgram(connection, smartContract, payerAccount)
    console.log('app', app)
    const confirmationTicket = await solanaJSON.pushJSON(connection, app, '{"abc":123}')
    const testJSON = await solanaJSON.pullJSON(connection, app.appAccount.publicKey)
    console.log(`Test: ${JSON.parse(testJSON).abc}`)
  },
}

module.exports = solanaJSON
