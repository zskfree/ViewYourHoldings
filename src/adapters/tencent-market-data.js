import { normalizeStockCode } from "../domain/stock-code.js";

function currencyFor(code) {
  if (code.startsWith("r_hk")) {
    return "HKD";
  }

  if (code.startsWith("us")) {
    return "USD";
  }

  return "CNY";
}

export function createTencentMarketData({
  fetchFn = globalThis.fetch,
  logger = console,
} = {}) {
  async function getQuotes(codes) {
    if (!codes || codes.length === 0) {
      return {};
    }

    const list = codes.map(normalizeStockCode).join(",");

    try {
      const response = await fetchFn(
        `https://qt.gtimg.cn/q=${encodeURIComponent(list)}`,
      );
      const buffer = await response.arrayBuffer();
      const lines = new TextDecoder("gbk").decode(buffer).split(";");
      const quotes = {};

      for (let line of lines) {
        line = line.trim();
        if (!line) {
          continue;
        }

        const equalsIndex = line.indexOf("=");
        if (equalsIndex === -1) {
          continue;
        }

        const code = line.substring(0, equalsIndex).replace(/^v_/, "");
        const fields = line
          .substring(equalsIndex + 1)
          .replace(/"/g, "")
          .split("~");

        if (fields.length > 30) {
          quotes[code] = {
            name: fields[1],
            current: Number.parseFloat(fields[3]),
            prevClose: Number.parseFloat(fields[4]),
            changeAmount: Number.parseFloat(fields[31]),
            changePercent: Number.parseFloat(fields[32]),
            currency: currencyFor(code),
          };
        }
      }

      return quotes;
    } catch (error) {
      logger.error("getQuotes 行情请求失败", error);
      throw error;
    }
  }

  async function getIndices() {
    try {
      const quotes = await getQuotes(["sh000001", "sz399006", "sz399300"]);
      return {
        sh: quotes.sh000001 || null,
        cyb: quotes.sz399006 || null,
        hs300: quotes.sz399300 || null,
      };
    } catch (error) {
      logger.error("getIndices 指数请求失败", error);
      throw error;
    }
  }

  async function searchStock(keyword) {
    if (!keyword || !keyword.trim()) {
      return null;
    }

    try {
      const response = await fetchFn(
        `https://smartbox.gtimg.cn/s3/?t=all&q=${encodeURIComponent(keyword.trim())}`,
      );
      const match = (await response.text()).match(/v_hint="([^"]*)"/);

      if (!match || !match[1] || match[1] === "N") {
        return null;
      }

      const first = match[1].split("^")[0];
      if (!first) {
        return null;
      }

      const fields = first.split("~");
      const market = fields[0];
      const codeValue = fields[1];
      let name = fields[2] || "";

      try {
        name = JSON.parse(`"${name}"`);
      } catch {
        // Preserve Tencent text when it is not JSON-escaped.
      }

      return {
        code: market === "hk" ? `r_hk${codeValue}` : `${market}${codeValue}`,
        name: name || keyword,
      };
    } catch (error) {
      logger.error("searchStock 搜索股票失败", error);
      return null;
    }
  }

  return { getQuotes, getIndices, searchStock };
}
