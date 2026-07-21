import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { store } from "../store.js";

registerMainMenuItem({ label: "📋 Overview", data: "trip:overview", order: 70 });

const composer = new Composer<Ctx>();

composer.command("overview", async (ctx) => {
  await showOverview(ctx);
});

composer.callbackQuery("trip:overview", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showOverview(ctx);
});

async function showOverview(ctx: Ctx) {
  const tripId = ctx.session.activeTripId;
  if (!tripId) {
    await ctx.reply("You don't have an active trip yet. Create one first!", {
      reply_markup: inlineKeyboard([[inlineButton("➕ Create trip", "trip:create")]]),
    });
    return;
  }

  const trip = store.getTrip(tripId);
  if (!trip) {
    await ctx.reply("Trip not found.");
    return;
  }

  if (ctx.from?.id !== trip.organizerId) {
    await ctx.reply("Only the trip organizer can see the full overview.");
    return;
  }

  const members = store.getTripMembers(tripId);
  const expenses = store.getTripExpenses(tripId);
  const debts = store.getTripDebts(tripId);

  let totalSpent = 0;
  for (const e of expenses) totalSpent += e.amount;

  const lines: string[] = [];
  lines.push(`📁 ${trip.name} (${trip.currency})`);
  lines.push(`Organizer: User ${trip.organizerId}`);
  lines.push(`Members: ${members.length}`);
  lines.push(`Total spent: ${trip.currency} ${totalSpent.toFixed(2)}`);
  lines.push("");

  if (expenses.length === 0) {
    lines.push("No expenses logged yet.");
  } else {
    lines.push("Expenses:");
    for (const e of expenses) {
      const payerLabel = e.payerId === ctx.from?.id ? "You" : `User ${e.payerId}`;
      lines.push(`• ${e.description}: ${trip.currency} ${e.amount.toFixed(2)} (paid by ${payerLabel})`);
    }
  }

  if (debts.length > 0) {
    lines.push("");
    lines.push("Outstanding debts:");
    for (const d of debts) {
      const debtorLabel = d.debtorId === ctx.from?.id ? "You" : `User ${d.debtorId}`;
      const creditorLabel = d.creditorId === ctx.from?.id ? "You" : `User ${d.creditorId}`;
      lines.push(`• ${debtorLabel} → ${creditorLabel}: ${trip.currency} ${d.amount.toFixed(2)}`);
    }
  }

  const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
  await ctx.reply(lines.join("\n"), { reply_markup: backToMenu });
}

export default composer;
