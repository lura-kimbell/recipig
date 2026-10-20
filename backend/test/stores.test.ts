import { createMemoryStores } from '../src/memoryStores.ts';
import { runStoreContract } from './storeContract.ts';

runStoreContract('memory stores', async () => ({ stores: createMemoryStores() }));

// The MongoDB stores need a real database. Point TEST_MONGODB_URI at a throwaway one, e.g.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test
// Each test uses its own temporary database, which is dropped afterwards.
const uri = process.env.TEST_MONGODB_URI;
runStoreContract(
  'mongo stores',
  async () => {
    // Imported here so the memory tests above run even where the mongodb package isn't installed.
    const { connectMongo } = await import('../src/mongoStores.ts');
    const handle = await connectMongo(uri!, `recipig_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    return {
      stores: handle.stores,
      close: async () => {
        await handle.db.dropDatabase();
        await handle.close();
      },
    };
  },
  uri ? undefined : 'set TEST_MONGODB_URI to run these',
);
