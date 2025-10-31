import { Client, Databases, ID, Permission, Role } from 'node-appwrite';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function setup() {
  console.log('🚀 Tic-Tac-Time Appwrite Setup\n');
  
  const endpoint = await question('Appwrite Endpoint (default: https://cloud.appwrite.io/v1): ') 
    || 'https://cloud.appwrite.io/v1';
  const projectId = await question('Project ID: ');
  const apiKey = await question('API Key (from Appwrite Console): ');
  
  if (!projectId || !apiKey) {
    console.error('❌ Project ID and API Key are required!');
    rl.close();
    process.exit(1);
  }

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

  const databases = new Databases(client);

  try {
    // Use custom readable IDs
    const databaseId = 'tictactime_db';
    const collectionId = 'tictactime_games';
    
    // Try to delete existing database if it exists
    try {
      await databases.delete(databaseId);
      console.log('🧹 Cleaned up existing database');
    } catch (e) {
      // Database doesn't exist, continue
    }
    
    console.log('\n📦 Creating database...');
    await databases.create(databaseId, 'TicTacTime');
    console.log('✅ Database created:', databaseId);

    console.log('📦 Creating collection...');
    await databases.createCollection(
      databaseId,
      collectionId,
      'games',
      [
        Permission.create(Role.any()),
        Permission.read(Role.any()),
        Permission.update(Role.any()),
        Permission.delete(Role.any())
      ]
    );
    console.log('✅ Collection created with public permissions:', collectionId);

    console.log('📦 Creating attributes...');
    await databases.createStringAttribute(databaseId, collectionId, 'gameMode', 20, true);
    await databases.createStringAttribute(databaseId, collectionId, 'board', 10000, true);
    await databases.createStringAttribute(databaseId, collectionId, 'currentPlayer', 1, true);
    await databases.createStringAttribute(databaseId, collectionId, 'winner', 10, false);
    await databases.createStringAttribute(databaseId, collectionId, 'status', 20, true);
    await databases.createStringAttribute(databaseId, collectionId, 'player1', 255, true);
    await databases.createStringAttribute(databaseId, collectionId, 'player2', 255, false);
    await databases.createIntegerAttribute(databaseId, collectionId, 'currentTime', true);
    await databases.createStringAttribute(databaseId, collectionId, 'passwordHash', 64, false);
    await databases.createStringAttribute(databaseId, collectionId, 'roomName', 40, false);
    console.log('✅ Attributes created');

    console.log('⏳ Waiting for attributes to be ready...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('📦 Creating indexes...');
    await databases.createIndex(databaseId, collectionId, 'status_idx', 'key', ['status']);
    await databases.createIndex(databaseId, collectionId, 'gameMode_idx', 'key', ['gameMode']);
    console.log('✅ Indexes created');

    const envContent = `VITE_APPWRITE_ENDPOINT=${endpoint}
VITE_APPWRITE_PROJECT_ID=${projectId}
VITE_APPWRITE_DATABASE_ID=${databaseId}
VITE_APPWRITE_COLLECTION_ID=${collectionId}
`;

    const fs = await import('fs');
    fs.writeFileSync('.env', envContent);
    console.log('\n✅ .env file created!');
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Setup Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📋 Resource IDs:');
    console.log(`   Database:   ${databaseId}`);
    console.log(`   Collection: ${collectionId}`);
    console.log(`   Indexes:    status_idx, gameMode_idx`);
    console.log('\n🚀 Next step: npm run dev');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  rl.close();
}

setup();
