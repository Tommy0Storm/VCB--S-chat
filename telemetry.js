const fs = require('fs');
const path = require('path');

const TIER_COSTS = {
    starter: { costPerToken: 0.00003, storagePerMonth: 1 },
    standard: { costPerToken: 0.00003, storagePerMonth: 1 },
    standardPremium: { costPerToken: 0.00004, storagePerMonth: 0 },
    pro: { costPerToken: 0.00003, storagePerMonth: 2 },
    proPremium: { costPerToken: 0.00004, storagePerMonth: 1 },
};

const TIER_CONFIG = {
    starter: { label: 'Starter', chatsIncluded: 24, price: 8 },
    standard: { label: 'Standard (chats)', chatsIncluded: 150, price: 12 },
    standardPremium: { label: 'Standard (rollovers)', chatsIncluded: 50, price: 6 },
    pro: { label: 'Pro (chats)', chatsIncluded: 400, price: 25 },
    proPremium: { label: 'Pro (rollovers)', chatsIncluded: 120, price: 14 },
};

function loadTelemetry(telemetryPath) {
    const resolved = path.resolve(process.cwd(), telemetryPath);
    const raw = fs.readFileSync(resolved, 'utf8');
    return JSON.parse(raw);
}

function calculateTierMetrics({ key, tokensPerChat, telemetry }) {
    const tierCosts = TIER_COSTS[key];
    const tierConfig = TIER_CONFIG[key];
    if (!tierCosts || !tierConfig) {
        throw new Error(`Unknown tier key: ${key}`);
    }

    const chats = telemetry[key]?.chats ?? tierConfig.chatsIncluded;
    const tokens = chats * tokensPerChat;
    const revenue = telemetry[key]?.revenue ?? tierConfig.price;
    const cerebrasCost = tokens * tierCosts.costPerToken;
    const storageCost = tierCosts.storagePerMonth;
    const totalCost = cerebrasCost + storageCost;
    const grossMargin = revenue === 0 ? 0 : (revenue - totalCost) / revenue;

    return {
        tier: tierConfig.label,
        chats,
        tokens,
        revenue,
        cerebrasCost,
        storageCost,
        totalCost,
        grossMargin,
        blendedCostPerChat: chats === 0 ? 0 : cerebrasCost / chats,
        revenuePerChat: chats === 0 ? 0 : revenue / chats,
    };
}

function buildReport(telemetry) {
    const metrics = [
        calculateTierMetrics({ key: 'starter', tokensPerChat: 600, telemetry }),
        calculateTierMetrics({ key: 'standard', tokensPerChat: 700, telemetry }),
        calculateTierMetrics({ key: 'standardPremium', tokensPerChat: 1400, telemetry }),
        calculateTierMetrics({ key: 'pro', tokensPerChat: 700, telemetry }),
        calculateTierMetrics({ key: 'proPremium', tokensPerChat: 1400, telemetry }),
    ];

    return metrics;
}

function toCurrency(value) {
    return `$${value.toFixed(2)}`;
}

function toPercent(value) {
    return `${(value * 100).toFixed(2)}%`;
}

function printTable(rows) {
    const headers = [
        'Tier',
        'Chats',
        'Tokens',
        'Revenue',
        'Cerebras Cost',
        'Storage',
        'Total Cost',
        'Gross Margin',
        'Cost/Chat',
        'Revenue/Chat',
    ];

    const data = rows.map((row) => [
        row.tier,
        row.chats,
        row.tokens.toLocaleString('en-US'),
        toCurrency(row.revenue),
        toCurrency(row.cerebrasCost),
        toCurrency(row.storageCost),
        toCurrency(row.totalCost),
        toPercent(row.grossMargin),
        toCurrency(row.blendedCostPerChat),
        toCurrency(row.revenuePerChat),
    ]);

    const widths = headers.map((header, idx) => {
        const columnValues = data.map((row) => String(row[idx]));
        return Math.max(header.length, ...columnValues.map((value) => value.length));
    });

    function pad(str, width) {
        const value = String(str);
        if (value.length >= width) {
            return value;
        }
        return value + ' '.repeat(width - value.length);
    }

    const headerLine = headers.map((header, idx) => pad(header, widths[idx])).join(' | ');
    const separator = widths.map((width) => '-'.repeat(width)).join('-+-');
    console.log(headerLine);
    console.log(separator);
    data.forEach((row) => {
        console.log(row.map((value, idx) => pad(value, widths[idx])).join(' | '));
    });
}

function main() {
    const telemetryFile = process.argv[2];
    if (!telemetryFile) {
        console.error('Usage: node src/telemetry.js <telemetry.json>');
        process.exit(1);
    }

    const telemetry = loadTelemetry(telemetryFile);
    const report = buildReport(telemetry);
    printTable(report);
}

if (require.main === module) {
    main();
}

module.exports = { buildReport };
