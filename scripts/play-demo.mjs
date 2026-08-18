// Two bots connect over real WebSockets and play a full game.
// Usage:  npm start          (in another terminal)
//         node scripts/play-demo.mjs
import { WebSocket } from "ws";

const PORT = process.env.PORT ?? 8000;
const PROTOCOL_VERSION = 1;

const pad = (text, width) => String(text).padEnd(width);
const describeCard = (card) =>
  `${card.name} (${card.action} ${card.amount}, ${card.targets} target${card.targets > 1 ? "s" : ""})`;

/** Pick the card that makes the front tray worth the most, and target from the front. */
function chooseMove(view) {
  const table = view.you.table;
  let best = null;
  for (const card of view.you.hand) {
    if (card.targets > table.length) continue;
    const front = table[0].value;
    const after = card.action === "add" ? front + card.amount : front * card.amount;
    if (!best || after > best.after) {
      best = { card, after, targetTrayIds: table.slice(0, card.targets).map((t) => t.id) };
    }
  }
  return best;
}

function renderBoard(view) {
  const trays = (side) => side.table.map((t) => t.value).join(" ");
  return [
    `\n  Round ${view.roundIndex + 1}/${view.roundCount}   phase: ${view.phase}`,
    `    ${pad(view.you.name + " (you)", 14)} score ${pad(view.you.score, 4)} table: ${trays(view.you)}   <- next eaten: ${view.you.table[0].value}`,
    `    ${pad(view.opponent.name, 14)} score ${pad(view.opponent.score, 4)} table: ${trays(view.opponent)}   (${view.opponent.handCount} cards held, hidden)`,
  ].join("\n");
}

function bot(name, { verbose }) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  const send = (msg) => ws.send(JSON.stringify(msg));
  let lastRoundSubmitted = -1;
  let lastRoundRendered = -1;
  const done = new Promise((resolve) => {
    ws.on("open", () => send({ type: "hello", protocolVersion: PROTOCOL_VERSION, name }));
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      switch (msg.type) {
        case "welcome":
          if (verbose) console.log(`${name}: seated, session ${msg.sessionToken.slice(0, 8)}…`);
          send({ type: "queueJoin" });
          break;
        case "queueWaiting":
          if (verbose) console.log(`${name}: waiting for an opponent…`);
          break;
        case "roomState": {
          if (msg.phase !== "in-progress") break;
          // One board per round, not one per state update (three arrive each round).
          if (verbose && msg.roundIndex !== lastRoundRendered) {
            lastRoundRendered = msg.roundIndex;
            console.log(renderBoard(msg));
          }
          if (msg.you.submitted || msg.roundIndex === lastRoundSubmitted) break;
          const move = chooseMove(msg);
          if (!move) break;
          lastRoundSubmitted = msg.roundIndex;
          if (verbose) console.log(`    ${name} plays: ${describeCard(move.card)}`);
          send({ type: "submitTurn", cardId: move.card.id, targetTrayIds: move.targetTrayIds });
          break;
        }
        case "actionRejected":
          console.log(`${name}: REJECTED ${msg.code} — ${msg.message}`);
          break;
        case "gameOver":
          console.log(
            `\n  ${pad(name, 8)} ${msg.result.kind.toUpperCase()}   final scores  a: ${msg.result.scores.a}  b: ${msg.result.scores.b}`,
          );
          ws.close();
          resolve();
          break;
      }
    });
    ws.on("error", (err) => {
      console.error(`${name}: ${err.message} — is the server running? (npm start)`);
      resolve();
    });
  });
  return done;
}

console.log(`Connecting two bots to ws://127.0.0.1:${PORT} …`);
await Promise.all([bot("Riley", { verbose: true }), bot("Sam", { verbose: false })]);
console.log("\nDone.");
process.exit(0);
