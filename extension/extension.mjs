// Copilot Cost Meter
// Adds a /cost slash command that estimates Copilot CLI AI Credit spend from session token usage.

import { joinSession } from "@github/copilot-sdk/extension";

const MILLION = 1_000_000;
const CREDITS_PER_USD = 100;
const PRICING_SOURCE = "https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing";

const PRICE_BY_MODEL = [
    { match: /^gpt-4\.1(?:$|-)/i, inputPerMillion: 2, cachedInputPerMillion: 0.5, outputPerMillion: 8 },
    { match: /^gpt-5\.5(?:$|-)/i, inputPerMillion: 5, cachedInputPerMillion: 0.5, outputPerMillion: 30 },
    { match: /^gpt-5\.4[- ]?mini(?:$|-)/i, inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.5 },
    { match: /^gpt-5\.4[- ]?nano(?:$|-)/i, inputPerMillion: 0.2, cachedInputPerMillion: 0.02, outputPerMillion: 1.25 },
    { match: /^gpt-5\.4(?:$|-)/i, inputPerMillion: 2.5, cachedInputPerMillion: 0.25, outputPerMillion: 15 },
    { match: /^gpt-5\.3[- ]?codex(?:$|-)/i, inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14 },
    { match: /^gpt-5\.2[- ]?codex(?:$|-)/i, inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14 },
    { match: /^gpt-5\.2(?:$|-)/i, inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14 },
    { match: /^gpt-5(?:-mini| mini|$)/i, inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2 },
    { match: /^claude-haiku-4\.5/i, inputPerMillion: 1, cachedInputPerMillion: 0.1, cacheWritePerMillion: 1.25, outputPerMillion: 5 },
    { match: /^claude-sonnet-4\.6/i, inputPerMillion: 3, cachedInputPerMillion: 0.3, cacheWritePerMillion: 3.75, outputPerMillion: 15 },
    { match: /^claude-sonnet-4\.5/i, inputPerMillion: 3, cachedInputPerMillion: 0.3, cacheWritePerMillion: 3.75, outputPerMillion: 15 },
    { match: /^claude-sonnet-4(?:$|-)/i, inputPerMillion: 3, cachedInputPerMillion: 0.3, cacheWritePerMillion: 3.75, outputPerMillion: 15 },
    { match: /^claude-opus-4\.7/i, inputPerMillion: 5, cachedInputPerMillion: 0.5, cacheWritePerMillion: 6.25, outputPerMillion: 25 },
    { match: /^claude-opus-4\.6/i, inputPerMillion: 5, cachedInputPerMillion: 0.5, cacheWritePerMillion: 6.25, outputPerMillion: 25 },
    { match: /^claude-opus-4\.5/i, inputPerMillion: 5, cachedInputPerMillion: 0.5, cacheWritePerMillion: 6.25, outputPerMillion: 25 },
    { match: /^gemini-2\.5[- ]?pro/i, inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10 },
    { match: /^gemini-3(?:\.0)?[- ]?flash/i, inputPerMillion: 0.5, cachedInputPerMillion: 0.05, outputPerMillion: 3 },
    { match: /^gemini-3\.1[- ]?pro/i, inputPerMillion: 2, cachedInputPerMillion: 0.2, outputPerMillion: 12 },
    { match: /^grok[- ]?code[- ]?fast[- ]?1/i, inputPerMillion: 0.2, cachedInputPerMillion: 0.02, outputPerMillion: 1.5 },
    { match: /^raptor[- ]?mini/i, inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2 },
    { match: /^goldeneye/i, inputPerMillion: 1.25, cachedInputPerMillion: 0.125, outputPerMillion: 10 },
];

function priceForModel(modelId) {
    return PRICE_BY_MODEL.find((entry) => entry.match.test(modelId));
}

function money(value) {
    return `$${value.toFixed(2)}`;
}

function credits(value) {
    return `${Math.round(value).toLocaleString("en-US")} credits`;
}

function costText(usd) {
    return `${credits(usd * CREDITS_PER_USD)} / ${money(usd)}`;
}

function tokens(value = 0) {
    return Math.round(value).toLocaleString("en-US");
}

function estimateCost(modelId, usage) {
    const price = priceForModel(modelId);
    if (!price) return { price, usd: undefined };

    const cachedInputTokens = usage.cacheReadTokens || 0;
    const cacheWriteTokens = usage.cacheWriteTokens || 0;
    const billableInputTokens = Math.max(0, (usage.inputTokens || 0) - cachedInputTokens - cacheWriteTokens);
    const inputUsd = billableInputTokens * price.inputPerMillion / MILLION;
    const cacheReadUsd = cachedInputTokens * price.cachedInputPerMillion / MILLION;
    const cacheWriteRate = price.cacheWritePerMillion ?? price.inputPerMillion;
    const cacheWriteUsd = cacheWriteTokens * cacheWriteRate / MILLION;
    const outputTokens = usage.outputTokens || 0;
    const outputUsd = outputTokens * price.outputPerMillion / MILLION;

    return {
        price,
        usd: inputUsd + cacheReadUsd + cacheWriteUsd + outputUsd,
        billableInputTokens,
        cachedInputTokens,
        cacheWriteTokens,
        outputTokens,
        inputUsd,
        cacheReadUsd,
        cacheWriteUsd,
        outputUsd,
    };
}

function hasUsage(usage = {}) {
    return Boolean(
        usage.inputTokens ||
        usage.outputTokens ||
        usage.cacheReadTokens ||
        usage.cacheWriteTokens ||
        usage.reasoningTokens
    );
}

function buildReport(metrics) {
    const estimates = Object.entries(metrics.modelMetrics || {})
        .filter(([, metric]) => hasUsage(metric?.usage))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([modelId, metric]) => ({
            modelId,
            metric,
            estimate: estimateCost(modelId, metric.usage || {}),
        }));

    const lines = ["| Model | Tokens | Cost |", "| --- | ---: | ---: |"];
    let totalTokens = 0;
    let totalUsd = 0;
    let hasUnknownPricing = false;

    for (const { modelId, metric, estimate } of estimates) {
        const usage = metric.usage || {};
        if (estimate.usd === undefined) {
            hasUnknownPricing = true;
            const modelTokens = (usage.inputTokens || 0)
                + (usage.outputTokens || 0)
                + (usage.cacheReadTokens || 0)
                + (usage.cacheWriteTokens || 0);
            totalTokens += modelTokens;
            lines.push(`| ${modelId} | ${tokens(modelTokens)} | rate unknown |`);
            continue;
        }

        const buckets = [
            ["input", estimate.billableInputTokens, estimate.inputUsd],
            ["cached input", estimate.cachedInputTokens, estimate.cacheReadUsd],
            ["cache write", estimate.cacheWriteTokens, estimate.cacheWriteUsd],
            ["output", estimate.outputTokens, estimate.outputUsd],
        ];

        for (const [label, tokenCount, usd] of buckets) {
            if (tokenCount > 0) {
                lines.push(`| ${modelId} ${label} | ${tokens(tokenCount)} | ${costText(usd)} |`);
                totalTokens += tokenCount;
            }
        }
        totalUsd += estimate.usd;
    }

    if (estimates.length === 0) {
        lines.push("| No model calls recorded yet | 0 | $0.00 |");
    } else {
        lines.push(`| **Total** | **${tokens(totalTokens)}** | **${costText(totalUsd)}** |`);
    }

    if (hasUnknownPricing) {
        lines.push(`| Pricing source |  | ${PRICING_SOURCE} |`);
    }

    return lines.join("\n");
}

const session = await joinSession({
    commands: [
        {
            name: "cost",
            description: "Estimate this Copilot CLI session's AI Credit and USD cost from token usage",
            handler: async () => {
                const metrics = await session.rpc.usage.getMetrics();
                await session.log(buildReport(metrics));
            },
        },
    ],
});
