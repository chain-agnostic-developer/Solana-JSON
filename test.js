const solanaJSON = require('./solana-json.js')

;(async () => {
  console.log(new Date(), 'deploying...')
  // const connection = solanaJSON.setupConnection('https://devnet.solana.com');
  const connection = solanaJSON.setupConnection('http://localhost:8899')
  const payerAccount = await solanaJSON.createUser()
  await solanaJSON.fundUser(connection, payerAccount)
  const smartContract = {
    pathToProgram: './solana-json.so',
    dataLayout: solanaJSON.setDataStructure(1000),
  }
  const app = await solanaJSON.loadProgram(connection, smartContract, payerAccount)
  console.log('app', app)

  console.log(new Date(), 'Pushing json to smart contracts')
  const confirmationTicket = await solanaJSON.pushJSON(connection, app, payerAccount, '{"abc":123}')

  console.log(new Date(), 'Confirmation ticket details', confirmationTicket)

  console.log(new Date(), 'Pulling json data from smart contract')
  const testJSON = await solanaJSON.pullJSON(connection, app.appAccount.publicKey)

  console.log(new Date(), 'Data from solana program', testJSON)

  console.log(new Date(), `Test: ${JSON.parse(testJSON).abc}`)
})()
