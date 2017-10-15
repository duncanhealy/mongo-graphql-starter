import { MongoClient } from "mongodb";
import resolvers from "./graphQL/resolver";
import typeDefs from "./graphQL/schema";
import { makeExecutableSchema } from "graphql-tools";

import { queryAndMatchArray } from "../testUtil";

let db, schema;
beforeAll(async () => {
  db = await MongoClient.connect("mongodb://localhost:27017/mongo-graphql-starter");
  schema = makeExecutableSchema({ typeDefs, resolvers, initialValue: { db: {} } });

  await db.collection("books").insert({ title: "Book 100", pages: 100, createdOn: new Date("2004-06-02") });
  await db.collection("books").insert({ title: "Book 150", pages: 150, createdOn: new Date("2004-06-02T01:30:45") });
  await db.collection("books").insert({ title: "Book 200", pages: 200, createdOn: new Date("2004-06-02T01:30:45Z") });
});

afterAll(async () => {
  await db.collection("books").remove({});
  db.close();
  db = null;
});

test("Date display match", async () => {
  await queryAndMatchArray({ schema, db, query: "{allBooks(pages: 100){createdOn}}", coll: "allBooks", results: [{ createdOn: "06/02/2004" }] });
});
