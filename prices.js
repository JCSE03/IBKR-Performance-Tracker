export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get('symbols') || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!symbols.length) {
    return json({ error: 'No symbols provided' }, 400);
  }

  try {
    // Fetch all symbols + USDSGD in parallel from Yahoo Finance (no API key needed)
    const tickers = [...symbols.map(s => s + '.L'), 'USDSGD=X'];
    const results = await Promise.all(
      tickers.map(async ticker => {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        });
        if (!res.ok) throw new Error(`Yahoo Finance error for ${ticker}: ${res.status}`);
        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) throw new Error(`No data for ${ticker}`);
        return {
          ticker,
          price: meta.regularMarketPrice,
          previousClose: meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPreviousClose,
          changePercent: meta.regularMarketChangePercent ?? null,
        };
      })
    );

    const prices = {};
    const changes = {};
    let usdSgd = 1.3;

    for (const r of results) {
      if (r.ticker === 'USDSGD=X') {
        usdSgd = r.price;
      } else {
        const sym = r.ticker.replace('.L', '');
        prices[sym] = r.price;
        if (r.changePercent != null) {
          changes[sym] = r.changePercent;
        } else if (r.previousClose && r.price) {
          changes[sym] = ((r.price - r.previousClose) / r.previousClose) * 100;
        }
      }
    }

    return json({ usdSgd, prices, changes });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
