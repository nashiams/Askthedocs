import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI || "";

const client = new MongoClient(uri);

const database = client.db("Askthedocs");
console.log("Pinged your deployment. You successfully connected to MongoDB!");

export default database;
