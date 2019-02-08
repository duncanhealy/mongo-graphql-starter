import { ObjectId } from "mongodb";
import * as dbHelpers from "./dbHelpers";
import processHook from "./processHook";

export const startDbMutation = async ({ root, args, context }, objName, typeMetadata, { create, update, delete: isDelete }) => {
  let [db, client] = await Promise.all([
    typeof root.db === "function" ? await root.db() : root.db,
    typeof root.client === "function" ? await root.client() : root.client
  ]);
  let session = client ? client.startSession() : null;
  let transaction = false;
  if (session && session.startTransaction) {
    if (create && mutationRequiresTransaction({ typeMetadata, newObjectArgs: args[objName] })) {
      transaction = true;
    }
    if (update && mutationRequiresTransaction({ typeMetadata, updateObjectArgs: args })) {
      transaction = true;
    }
    if (isDelete && deletionRequiresTransaction({ typeMetadata })) {
      transaction = true;
    }
  }
  if (transaction) {
    session.startTransaction();
  }
  context.__mongodb = db;
  return { db, client, session, transaction };
};

export const mutationComplete = async (session, transaction) => {
  if (transaction) {
    await session.commitTransaction();
  }
};

export const mutationError = async (err, session, transaction) => {
  if (transaction) {
    await session.abortTransaction();
  }
  throw err;
};

export const mutationOver = session => {
  if (session) {
    session.endSession();
  }
};

export const mutationRequiresTransaction = ({ typeMetadata, newObjectArgs, updateObjectArgs }) => {
  if (newObjectArgs) {
    return newObjectMutationRequiresTransaction(typeMetadata, newObjectArgs);
  } else if (updateObjectArgs) {
    return updateObjectMutationRequiresTransaction(typeMetadata, updateObjectArgs);
  }
};

export const deletionRequiresTransaction = ({ typeMetadata }) => {
  return Object.entries(typeMetadata.relationships).some(([k, rel]) => rel.fkField === "_id");
};

export const newObjectMutationRequiresTransaction = (typeMetadata, args) => {
  let relationships = typeMetadata.relationships || {};
  for (let k of Object.keys(relationships)) {
    let relationship = relationships[k];
    if (relationship.oneToMany) {
      if (args[k]) {
        return true;
      }
    } else {
      if (relationship.__isArray) {
        if (args[k]) {
          return true;
        }
      } else if (relationship.__isObject) {
        if (args[k]) {
          return true;
        }
      }
    }
  }
  return false;
};

export const updateObjectMutationRequiresTransaction = (typeMetadata, args) => {
  let relationships = typeMetadata.relationships || {};
  for (let k of Object.keys(relationships)) {
    let relationship = relationships[k];
    if (relationship.oneToMany) {
      if (args[`${k}_ADD`]) {
        return true;
      }
    } else if (relationship.__isObject) {
      if (args.Updates[`${k}_SET`]) {
        return true;
      }
    } else if (relationship.__isArray) {
      if (args.Updates[`${k}_ADD`]) {
        return true;
      }
    }
  }
  return false;
};

export const pullFkFromArray = async (_id, relType, dbInfo, graphQLPacket) => {
  let { root, args, context, ast, hooksObj } = graphQLPacket;
  let { db, table, key, isString, session } = dbInfo;
  let _ids = Array.isArray(_id) ? _id : [_id];
  _ids = _ids.map(_id => (isString ? "" + _id : ObjectId(_id)));

  let $match = { [key]: { $in: _ids } };
  let updates = { $pull: { [key]: { $in: _ids } } };

  if ((await processHook(hooksObj, relType, "beforeUpdate", $match, updates, { db, root, args, context, ast, session })) === false) {
    return { success: true };
  }
  await dbHelpers.runUpdate(db, table, $match, updates, { session, multi: true });
  await processHook(hooksObj, relType, "afterUpdate", $match, updates, { db, root, args, context, ast, session });
};

export const clearFk = async (_id, relType, dbInfo, graphQLPacket) => {
  let { root, args, context, ast, hooksObj } = graphQLPacket;
  let { db, table, key, isString, session } = dbInfo;

  _id = isString ? "" + _id : ObjectId(_id);

  let $match = { [key]: _id };
  let updates = { $unset: { [key]: "" } };

  if ((await processHook(hooksObj, relType, "beforeUpdate", $match, updates, { db, root, args, context, ast, session })) === false) {
    return { success: true };
  }
  await dbHelpers.runUpdate(db, table, $match, updates, { session, multi: true });
  await processHook(hooksObj, relType, "afterUpdate", $match, updates, { db, root, args, context, ast, session });
};
