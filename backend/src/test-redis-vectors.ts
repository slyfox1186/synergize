#!/usr/bin/env tsx

/**
 * Test script for Redis Vector Store
 * Run with: npm run test:redis
 */

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Redis } from 'ioredis';
import { RedisVectorStore } from './services/redisVectorStore.js';
import { config } from './config.js';

const logger = {
  info: (msg: string, data?: unknown): void => { console.log(`[INFO] ${msg}`, data || ''); },
  warn: (msg: string, data?: unknown): void => { console.log(`[WARN] ${msg}`, data || ''); },
  error: (msg: string, data?: unknown): void => { console.error(`[ERROR] ${msg}`, data || ''); },
  debug: (msg: string, data?: unknown): void => { console.log(`[DEBUG] ${msg}`, data || ''); }
};

async function runTest(): Promise<void> {
  console.log('🚀 Starting Redis Vector Store Test\n');
  
  // Create Redis connection
  const redisUrl = `redis://${config.redis.host}:${config.redis.port}`;
  const redis = new Redis(redisUrl);
  console.log('✅ Connected to Redis\n');
  
  // Create vector store instance with custom logger
  const vectorStore = new RedisVectorStore(redis);
  (vectorStore as any).logger = logger; // Override logger for test
  
  // Initialize (creates index)
  console.log('📊 Initializing vector store...');
  await vectorStore.initialize();
  console.log('✅ Vector store initialized\n');
  
  // Test data
  const testSessionId = 'test-' + crypto.randomUUID();
  const testDocuments = [
    {
      id: 'doc1-' + crypto.randomUUID(),
      content: 'The quick brown fox jumps over the lazy dog',
      metadata: {
        sessionId: testSessionId,
        phase: 'BRAINSTORM',
        modelId: 'test-model-1',
        timestamp: Date.now(),
        tokens: 10
      }
    },
    {
      id: 'doc2-' + crypto.randomUUID(),
      content: 'Machine learning is a subset of artificial intelligence',
      metadata: {
        sessionId: testSessionId,
        phase: 'CRITIQUE',
        modelId: 'test-model-2',
        timestamp: Date.now(),
        tokens: 8
      }
    },
    {
      id: 'doc3-' + crypto.randomUUID(),
      content: 'Redis is an in-memory data structure store',
      metadata: {
        sessionId: testSessionId,
        phase: 'SYNTHESIZE',
        modelId: 'test-model-1',
        timestamp: Date.now(),
        tokens: 7
      }
    }
  ];
  
  // Store documents
  console.log('📝 Storing test documents...');
  for (const doc of testDocuments) {
    console.log(`\n--- Storing document ${doc.id} ---`);
    await vectorStore.storeDocument(doc.id, doc.content, doc.metadata);
  }
  console.log('\n✅ All documents stored\n');
  
  // Wait a bit for indexing
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 1: Search with sessionId filter
  console.log('🔍 TEST 1: Search with sessionId filter');
  console.log(`SessionId: ${testSessionId}`);
  const results1 = await vectorStore.search(
    'artificial intelligence',
    { sessionId: testSessionId },
    5
  );
  console.log(`Found ${results1.length} results`);
  results1.forEach(r => {
    console.log(`  - Score: ${r.score.toFixed(4)}, Content: "${r.content.substring(0, 50)}..."`);
  });
  
  // Test 2: Search with phase filter
  console.log('\n🔍 TEST 2: Search with phase filter');
  const results2 = await vectorStore.search(
    'data',
    { sessionId: testSessionId, phase: 'CRITIQUE' },
    5
  );
  console.log(`Found ${results2.length} results with phase=CRITIQUE`);
  
  // Test 3: Search without filters
  console.log('\n🔍 TEST 3: Search without any filters');
  const results3 = await vectorStore.search(
    'fox',
    {},
    5
  );
  console.log(`Found ${results3.length} results without filters`);
  
  // Test 4: Direct Redis query to verify TAG escaping
  console.log('\n🔍 TEST 4: Direct Redis TAG query test');
  try {
    // Test different escaping approaches
    const approaches = [
      { name: 'Single backslash', escaped: testSessionId.replace(/-/g, '\\-') },
      { name: 'Double backslash', escaped: testSessionId.replace(/-/g, '\\\\-') },
      { name: 'No escaping', escaped: testSessionId },
    ];
    
    for (const approach of approaches) {
      console.log(`\nTrying ${approach.name}:`);
      const directQuery = `@sessionId:{${approach.escaped}}`;
      console.log(`Query: ${directQuery}`);
      
      try {
        const directResults = await redis.call(
          'FT.SEARCH',
          'idx:synergize',
          directQuery,
          'LIMIT', '0', '10'
        ) as any[];
        console.log(`✅ Results: ${(directResults.length - 1) / 2} documents found`);
      } catch (error: any) {
        console.log(`❌ Failed: ${error.message}`);
      }
    }
  } catch (error: any) {
    console.error('Direct query test failed:', error.message);
  }
  
  // Test 5: Get index info
  console.log('\n📊 TEST 5: Index information');
  try {
    const indexInfo = await redis.call('FT.INFO', 'idx:synergize');
    console.log('Index exists: ✅');
    
    // Find field definitions in the info array
    if (Array.isArray(indexInfo)) {
      const fieldsIndex = indexInfo.indexOf('attributes');
      if (fieldsIndex !== -1 && Array.isArray(indexInfo[fieldsIndex + 1])) {
        console.log('\nIndex fields:');
        const fields = indexInfo[fieldsIndex + 1];
        for (let i = 0; i < fields.length; i++) {
          const field = fields[i];
          if (Array.isArray(field) && field.length >= 6) {
            console.log(`  - ${field[1]} (${field[3]}) -> ${field[5]}`);
          }
        }
      }
    }
  } catch (error: any) {
    console.error('Failed to get index info:', error.message);
  }
  
  // Test 6: Raw document check
  console.log('\n📄 TEST 6: Raw document verification');
  try {
    const docKey = `doc:synergize:${testDocuments[0].id}`;
    const rawDoc = await redis.call('JSON.GET', docKey) as string;
    const parsedDoc = JSON.parse(rawDoc);
    console.log('Document structure:');
    console.log(`  - id: ${parsedDoc.id}`);
    console.log(`  - content: "${parsedDoc.content.substring(0, 30)}..."`);
    console.log(`  - metadata.sessionId: ${parsedDoc.metadata.sessionId}`);
    console.log(`  - metadata.phase: ${parsedDoc.metadata.phase}`);
    console.log(`  - vector length: ${parsedDoc.vector?.length || 0}`);
  } catch (error: any) {
    console.error('Failed to get raw document:', error.message);
  }
  
  // Cleanup
  console.log('\n🧹 Cleaning up test data...');
  await vectorStore.deleteSession(testSessionId);
  console.log('✅ Test data cleaned up');
  
  // Close connection
  redis.disconnect();
  console.log('\n✅ Test completed!');
}

// Run the test
runTest().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});