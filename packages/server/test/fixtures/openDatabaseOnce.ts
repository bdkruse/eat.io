// Opens the accounts database at the path given on the command line, then exits.
// The concurrency test starts several of these at once, the way a host can start two
// copies of the server during a restart.
import { openAccountsDatabase } from "../../src/accounts/database.js";

const databasePath = process.argv[2];
if (!databasePath) throw new Error("usage: openDatabaseOnce <path>");
openAccountsDatabase(databasePath).close();
