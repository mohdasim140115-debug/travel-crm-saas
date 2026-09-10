import mongoose from 'mongoose'
import dns from 'dns'

// Node's own DNS resolver sometimes can't resolve the `mongodb+srv://` SRV
// record on Windows/corporate networks even though the OS resolver works fine
// (seen as `querySrv ECONNREFUSED`) — pointing Node at a public resolver fixes it.
dns.setServers(['8.8.8.8', '1.1.1.1'])

let cached = global.mongoose

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null }
}

async function connectDB() {
  const MONGODB_URI = process.env.MONGODB_URI
  if (!MONGODB_URI) {
    throw new Error(
      'Please define the MONGODB_URI environment variable in .env.local'
    )
  }

  // A cached connection is only good while it's actually connected. Atlas
  // (especially shared/Flex tiers) drops idle sockets and does short
  // failovers; the old code handed back a dead `cached.conn` forever, so
  // every request during that window threw and the route 500'd
  // ("Internal server error" on login, intermittently). readyState 1 =
  // connected, 2 = connecting (fine, queries buffer) — anything else means
  // rebuild.
  if (cached.conn) {
    const state = cached.conn.connection?.readyState
    if (state === 1 || state === 2) {
      return cached.conn
    }
    cached.conn = null
    cached.promise = null
  }

  if (!cached.promise) {
    const opts = {
      // Let queries wait through a brief reconnect/failover instead of
      // throwing instantly — this is what was causing the random 500s.
      bufferCommands: true,
      retryWrites: true,
      retryReads: true,
      w: 'majority',
      maxPoolSize: 10,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    }

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => {
      console.log('✓ MongoDB connected successfully')
      return m
    })
  }

  try {
    cached.conn = await cached.promise
  } catch (e) {
    cached.promise = null
    console.error('✗ MongoDB connection failed:', e.message)
    throw e
  }

  return cached.conn
}

export default connectDB
