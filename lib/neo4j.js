import neo4j from "neo4j-driver";

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

    // 3. Process the Results
    const values = res.records.map(record => { return {source:record.get('source'), target:record.get('target')}});

    return values
  }
  finally {
    // 4. Close the session 
    await session.close()
  }
}
