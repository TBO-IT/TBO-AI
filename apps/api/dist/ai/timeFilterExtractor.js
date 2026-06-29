const MONTH_MAP = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12
};
const QUARTER_MAP = {
    q1: 1,
    q2: 2,
    q3: 3,
    q4: 4
};
export function buildTimeFilter(signal) {
    const lower = signal.toLowerCase();
    if (MONTH_MAP[lower]) {
        return {
            dimension: "month",
            operator: "=",
            value: MONTH_MAP[lower]
        };
    }
    if (QUARTER_MAP[lower]) {
        return {
            dimension: "quarter",
            operator: "=",
            value: QUARTER_MAP[lower]
        };
    }
    if (/^20\d{2}$/.test(lower)) {
        return {
            dimension: "year",
            operator: "=",
            value: Number(lower)
        };
    }
    return null;
}
