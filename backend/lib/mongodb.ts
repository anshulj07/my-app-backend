// import { MongoClient } from "mongodb";

// const uri = process.env.MONGODB_URI;
// const options = {
//   family: 4 // Forces IPv4, which often fixes SRV DNS issues on Windows
// };
// if (!uri) throw new Error("Missing MONGODB_URI");

// declare global {
//   // eslint-disable-next-line no-var
//   var _mongoClientPromise: Promise<MongoClient> | undefined;
// }

// let clientPromise: Promise<MongoClient>;

// if (process.env.NODE_ENV === "development") {
//   if (!global._mongoClientPromise) {
//     global._mongoClientPromise = new MongoClient(uri).connect();
//   }
//   clientPromise = global._mongoClientPromise;
// } else {
//   clientPromise = new MongoClient(uri).connect();
// }

// export default clientPromise;
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

const options = {
  family: 4 // optional
};

if (!uri) throw new Error("Missing MONGODB_URI");

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {

  if (!global._mongoClientPromise) {

    console.log("🟡 Connecting to MongoDB...");

    global._mongoClientPromise =
      new MongoClient(uri, options)
        .connect()
        .then((client) => {

          console.log("🟢 MongoDB Connected Successfully");

          return client;
        })
        .catch((err) => {

          console.log("🔴 MongoDB Connection Error:");
          console.log(err);

          throw err;
        });
  }

  clientPromise = global._mongoClientPromise;

} else {

  console.log("🟡 Connecting to MongoDB...");

  clientPromise =
    new MongoClient(uri, options)
      .connect()
      .then((client) => {

        console.log("🟢 MongoDB Connected Successfully");

        return client;
      })
      .catch((err) => {

        console.log("🔴 MongoDB Connection Error:");
        console.log(err);

        throw err;
      });
}

export default clientPromise;