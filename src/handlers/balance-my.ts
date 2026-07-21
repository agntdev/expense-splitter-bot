import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { store } from "../store.js";

registerMainMenuItem({ label: "💼 My balance", data: "balance:my", order: 50 });

const composer = new Composer<Ctx>();

composer.callbackQuery("balance:my", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const trips = store.getUserTrips(userId);
  if (trips.length === 0) {
    await ctx.reply("You're not in any trips yet. Create one to get started!", {
      reply_markup: inlineKeyboard([[inlineButton("➕ Create trip", "trip:create")]]),
    });
    return;
  }

  const lines: string[] = [];
  for (const trip of trips) {
    const debts = store.getTripDebts(trip.id);
    const myOwes: { creditorId: number; amount: number }[] = [];
    const owedToMe: { debtorId: number; amount: number }[] = [];

    for (const d of debts) {
      if (d.debtorId === userId) {
        myOwes.push({ creditorId: d.creditorId, amount: d.amount });
      }
      if (d.creditorId === userId) {
        owedToMe.push({ debtorId: d.debtorId, amount: d.amount });
      }
    }

    lines.push(`📁 ${trip.name} (${trip.currency})`);

    if (myOwes.length === 0 && owedToMe.length === 0) {
      lines.push("  All settled!");
    } else {
      for (const o of myOwes) {
        lines.push(`  You owe User ${o.creditorId}: ${trip.currency} ${o.amount.toFixed(2)}`);
      }
      for (const o of owedToMe) {
        lines.push(`  User ${o.debtorId} owes you: ${trip.currency} ${o.amount.toFixed(2)}`);
      }
    }
    lines.push("");
  }

  const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
  await ctx.reply(lines.join("\n").trim() || "All settled across all trips!", {
    reply_markup: backToMenu,
  });
});

export default composer;
