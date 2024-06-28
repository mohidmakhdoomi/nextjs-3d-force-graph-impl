const neo4j = require('neo4j-driver')


export async function test() {
  const session = driver.session()
  try {
    console.log(`Database running at ${process.env.NEO4J_URI}`)
    return "Good"
  }
  finally {
    await session.close()
  }
}

export async function read(cypher, params = {}) {
  let driver
  try {
    driver = neo4j.driver(
      process.env.NEO4J_URI,
      neo4j.auth.basic(
        process.env.NEO4J_USERNAME,
        process.env.NEO4J_PASSWORD
      )
    )
    await driver.verifyConnectivity()
  } catch(err) {
    let errorMessage
    if (err instanceof Error) {
      errorMessage = err.cause;
    }
    console.log(`-- Connection error --\n${err}\n-- Cause --\n${errorMessage}`)
    await driver.close()
    return
  }
  // 1. Open a session
  const session = driver.session({ database: 'neo4j' })
  
  try {
    // 2. Execute a Cypher Statement
    const res = await session.executeRead(tx => tx.run(cypher, params))
    
    // console.log(typeof res)

    // 3. Process the Results
    const values = res.records.map(record => { return {source:record.get('source'), target:record.get('target')}});

    // console.log("VALUES", typeof values)

    return values
  }
  finally {
    // 4. Close the session 
    await session.close()
  }
}

export async function write(cypher, params = {}) {
  // 1. Open a session
  const session = driver.session()

  try {
    // 2. Execute a Cypher Statement
    const res = await session.executeWrite(tx => tx.run(cypher, params))

    // 3. Process the Results
    const values = res.records.map(record => record.toObject())

    return values
  }
  finally {
    // 4. Close the session 
    await session.close()
  }
}
