// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer carrying the model's
// own inputs and the protocol's farm plan. No network: every byte it shows is already in data.js.
(function () {
  'use strict';

  // The dataset, and the dashboard's own state: the search text, the chosen category, which tab
  // is open, how the table is sorted, and which protocol's detail drawer is showing.
  var BOARD = window.RADAR;
  if (!BOARD) return;
  var mount = document.getElementById('board');
  var ui = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  // --- Formatting: the same short forms the board's numbers are shown in -----------------------

  var moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function usdShort(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return moneyFmt.format(n);
  }
  function pctShort(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function ageShort(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // --- The model, recomputed in the page --------------------------------------------------------
  //
  // The page recomputes a row from the snapshot figures and checks the number board.json carries,
  // so the page's code and the board's data are visibly the same arithmetic. The category multiple
  // is the row's own (the median mcap/TVL of live protocols in its category, computed from the
  // snapshot); the chain multiplier is recomputed from the model's constants.
  function recomputeValue(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chains = row.chains && row.chains.length ? row.chains.length : 1;
    var chainMult = 1 + (model.chain_bonus || 0) * Math.min(Math.max(chains - 1, 0), model.chain_bonus_cap || 0);
    var catMult = row.category_multiple === null || row.category_multiple === undefined ? 0.205 : row.category_multiple;
    return Math.max(1, Math.round(row.tvl_usd * catMult * growthMult * maturity * chainMult));
  }

  // --- The farm plan, derived in the page the same way main.ts derives it ----------------------
  //
  // Category, chains, TVL and age decide the action, the capital, the hold and every cost and
  // time. No name is special-cased, and the drawer shows the same plan board.json carries.
  function primaryChain(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalNeeded(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdWindow(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function categoryAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow a small amount against it and repay it, so both sides of the market are used.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' managed vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s highest-TVL farm on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('restak') >= 0) return "Restake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('staking') >= 0 || c.indexOf('staking pool') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('interest rate') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s basis vault on " + chain + ' and keep the position open.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0 || c.indexOf('dual-token') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('chain') >= 0 && c.indexOf('cross') < 0) return 'Bridge $' + capital + " of USDC to " + name + "'s chain and use its native apps, starting with " + name + ' itself.';
    if (c.indexOf('btc') >= 0 || c.indexOf('anchor') >= 0) return 'Deposit $' + capital + ' of BTC-backed collateral through ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('payments') >= 0 || c.indexOf('card') >= 0) return 'Use ' + name + ' to pay or spend $' + capital + ' on ' + chain + ', and keep the receipt.';
    if (c.indexOf('otc') >= 0 || c.indexOf('marketplace') >= 0) return 'Place one $' + capital + ' order on ' + name + "'s marketplace on " + chain + ' and complete it.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s governance vault on " + chain + ' and vote once.';
    if (c.indexOf('cedefi') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s CeDeFi product on " + chain + ' and keep the position open.';
    if (c.indexOf('indexes') >= 0 || c.indexOf('index') >= 0) return 'Buy $' + capital + ' of ' + name + "'s index token on " + chain + ' and hold it.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyQualifying(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'a supply, a borrow or a repayment';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'a swap, a deposit or a claim of rewards';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'a bridge or a swap on the destination chain';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'a stake, an unstake or a claim of rewards';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0) return 'a trade, a hedge or a margin top-up';
    if (c.indexOf('prediction') >= 0) return 'a market position or a claim';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'a deposit or a rebalance';
    if (c.indexOf('stable') >= 0 || c.indexOf('dual-token') >= 0) return 'a mint, a redeem or a deposit';
    if (c.indexOf('rwa') >= 0) return 'a mint or a hold check';
    if (c.indexOf('insurance') >= 0) return 'a cover check or a claim';
    if (c.indexOf('governance') >= 0) return 'a vote or a delegation';
    return 'a deposit, a swap or a vote';
  }
  function renderStep(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function buildFarmPlan(p) {
    var chain = primaryChain(p);
    var capital = capitalNeeded(p);
    var hold = holdWindow(p.age_days);
    var weekly = weeklyQualifying(p);
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: categoryAction(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as ' + weekly + '.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
    if (p.chains && p.chains.length > 1) {
      var second = p.chains[1];
      steps.push({ text: 'Repeat the main position on ' + second + ' too, so the activity is visible on more than one chain.', cost: 'another $' + Math.max(25, Math.round(capital / 2)) + ' of capital and about $4 of gas', time: '15 minutes to set up' });
    }
    return steps.map(renderStep);
  }

  // --- A tiny element builder --------------------------------------------------------------
  function tag(name, attrs) {
    var node = document.createElement(name);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // --- The location hash: the filter, the category and the open drawer survive a reload --------
  function readLocation() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) ui.q = params.get('q');
    if (params.get('p')) ui.selected = params.get('p');
    if (params.get('category')) ui.category = params.get('category');
  }
  function writeLocation() {
    var params = new URLSearchParams();
    if (ui.q) params.set('q', ui.q);
    if (ui.category !== 'all') params.set('category', ui.category);
    if (ui.selected) params.set('p', ui.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // --- Which rows the table shows, in which order ----------------------------------------------
  function visibleRows() {
    var q = ui.q.trim().toLowerCase();
    return BOARD.rows.filter(function (r) {
      if (ui.category !== 'all' && r.category !== ui.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function orderedRows(list) {
    var key = ui.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -ui.dir;
      if (av > bv) return ui.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // --- The page's sections -----------------------------------------------------------------------
  function topBar() {
    return tag('header', { class: 'top' },
      tag('div', { class: 'brand' }, tag('span', { class: 'mark' }), tag('span', { class: 'brand-name', text: 'Token Radar' })),
      tag('div', { class: 'top-meta' },
        tag('span', { text: 'Snapshot ' + BOARD.as_of }),
        tag('span', { text: 'DefiLlama protocol index' }),
        tag('span', { text: BOARD.model_version + ' model' })
      )
    );
  }

  function intro() {
    var top = BOARD.rows.length > 0 ? BOARD.rows[0] : null;
    return tag('section', { class: 'lede' },
      tag('div', null,
        tag('h1', { text: BOARD.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        tag('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(BOARD.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + BOARD.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      tag('div', { class: 'facts' },
        tag('div', { class: 'fact' }, tag('span', { text: 'Top pick' }), tag('b', { text: top ? top.name + ' · ' + usdShort(top.implied_value_usd) : 'n/a' })),
        tag('div', { class: 'fact' }, tag('span', { text: 'Watchlist covered' }), tag('b', { text: BOARD.watchlist_size + ' / ' + BOARD.watchlist_size })),
        tag('div', { class: 'fact' }, tag('span', { text: 'Pre-token rows scored' }), tag('b', { text: String(BOARD.board_size) })),
        tag('div', { class: 'fact' }, tag('span', { text: 'Early rows below the floor' }), tag('b', { text: String(BOARD.early_size) })),
        tag('div', { class: 'fact' }, tag('span', { text: 'Live-token protocols set aside' }), tag('b', { text: String(BOARD.live_size) }))
      )
    );
  }

  function filterBar() {
    var categories = Array.from(new Set(BOARD.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = tag('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: ui.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { ui.q = search.value; writeLocation(); paint(); });
    var select = tag('select', { id: 'category', 'aria-label': 'Filter by category' },
      tag('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return tag('option', { value: c, text: c, selected: c === ui.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { ui.category = select.value; writeLocation(); paint(); });
    var pre = tag('button', { type: 'button', 'aria-pressed': ui.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { ui.tab = 'pre-token'; paint(); } });
    var live = tag('button', { type: 'button', 'aria-pressed': ui.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { ui.tab = 'live'; paint(); } });
    return tag('div', { class: 'controls' },
      tag('div', { class: 'field' }, tag('label', { for: 'q', text: 'Search' }), search),
      tag('div', { class: 'field' }, tag('label', { for: 'category', text: 'Category' }), select),
      tag('div', { class: 'field' }, tag('span', { class: 'sub', text: 'Token status' }), tag('div', { class: 'tabs' }, pre, live)),
      tag('span', { class: 'count', text: ui.tab === 'pre-token' ? visibleRows().length + ' rows shown' : BOARD.live.length + ' live-token protocols' })
    );
  }

  function columnHeader(key, label) {
    return tag('th', { scope: 'col' },
      tag('button', { type: 'button', onclick: function () { if (ui.sort === key) ui.dir = -ui.dir; else { ui.sort = key; ui.dir = -1; } paint(); } },
        label,
        ui.sort === key ? tag('span', { 'aria-hidden': 'true', text: ui.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function preTokenTable() {
    var list = orderedRows(visibleRows());
    if (list.length === 0) {
      return tag('div', { class: 'panel' }, tag('div', { class: 'empty' },
        tag('h2', { text: 'No protocol matches that filter' }),
        tag('p', { text: 'Clear the search or pick another category to see the board again.' }),
        tag('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { ui.q = ''; ui.category = 'all'; writeLocation(); paint(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = tag('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : pctShort(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = tag('tr', {
        'data-selected': ui.selected === r.slug ? 'true' : 'false',
        'class': (ui.sort === 'implied' && ui.dir < 0 && r.rank <= 3) ? 'top3' : null,
        tabindex: '0',
        onclick: function () { showDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(r.slug); } }
      },
        tag('td', { class: 'num', text: String(r.rank) }),
        tag('td', null, tag('div', { class: 'name' },
          tag('b', { text: r.name }),
          tag('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 1).join(', ') : 'an unnamed chain') })
        )),
        tag('td', { class: 'num', text: usdShort(r.tvl_usd) }),
        tag('td', { class: 'num ' + growthClass, text: growth }),
        tag('td', { class: 'num', text: ageShort(r.age_days) }),
        tag('td', null, tag('div', { class: 'implied' },
          tag('div', { class: 'bar', 'aria-hidden': 'true' }, tag('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          tag('span', { class: 'num', text: usdShort(r.implied_value_usd) })
        )),
        tag('td', null, tag('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return tag('div', { class: 'panel' },
      tag('div', { class: 'table-wrap' },
        tag('table', null,
          tag('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          tag('colgroup', null,
            tag('col', { style: 'width:48px' }),
            tag('col', null),
            tag('col', { style: 'width:90px' }),
            tag('col', { style: 'width:80px' }),
            tag('col', { style: 'width:70px' }),
            tag('col', { style: 'width:180px' }),
            tag('col', { style: 'width:90px' })
          ),
          tag('thead', null, tag('tr', null,
            columnHeader('implied', 'Rank'),
            columnHeader('name', 'Protocol'),
            columnHeader('tvl', 'TVL'),
            columnHeader('growth', '7d'),
            columnHeader('age', 'Age'),
            columnHeader('implied', 'Implied value'),
            tag('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTokenTable() {
    var tbody = tag('tbody');
    BOARD.live.forEach(function (r) {
      tbody.appendChild(tag('tr', null,
        tag('td', { class: 'num', text: 'live' }),
        tag('td', null, tag('div', { class: 'name' }, tag('b', { text: r.name }), tag('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        tag('td', { class: 'num', text: usdShort(r.tvl_usd) }),
        tag('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: pctShort(r.change_7d) }),
        tag('td', { class: 'num', text: usdShort(r.mcap_usd) }),
        tag('td', null, tag('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return tag('div', { class: 'panel' },
      tag('div', { class: 'table-wrap' },
        tag('table', null,
          tag('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          tag('colgroup', null,
            tag('col', { style: 'width:120px' }),
            tag('col', null),
            tag('col', { style: 'width:90px' }),
            tag('col', { style: 'width:80px' }),
            tag('col', { style: 'width:110px' }),
            tag('col', { style: 'width:90px' })
          ),
          tag('thead', null, tag('tr', null, tag('th', { scope: 'col', text: 'Status' }), tag('th', { scope: 'col', text: 'Protocol' }), tag('th', { scope: 'col', text: 'TVL' }), tag('th', { scope: 'col', text: '7d' }), tag('th', { scope: 'col', text: 'Market cap' }), tag('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelExplainer() {
    var m = BOARD.model;
    return tag('section', { class: 'panel model' },
      tag('h2', { text: 'How implied value is computed' }),
      tag('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      tag('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.chain_bonus + ' x min(chains - 1, ' + m.chain_bonus_cap + ')) )'
      ),
      tag('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. The category multiple is the median market-cap-to-TVL ratio of live protocols in the same category, computed from the snapshot (global median ' + (BOARD.global_multiple ? BOARD.global_multiple.toFixed(3) : 'n/a') + ' when a category has too few live comparables), so a category the market prices richly lifts its pre-token protocols. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Multi-chain protocols earn a small reach bonus. The board is every pre-token protocol the watchlist rule keeps, at any TVL — the watchlist is the floor, never the ceiling — and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  // --- The detail drawer --------------------------------------------------------------------------
  var detail = tag('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  detail.addEventListener('close', function () { ui.selected = null; writeLocation(); });

  function showDetail(slug) {
    var row = BOARD.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    ui.selected = slug;
    writeLocation();
    detail.textContent = '';
    var steps = buildFarmPlan(row);
    detail.appendChild(tag('div', { class: 'detail-head' },
      tag('div', null,
        tag('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + BOARD.board_size }),
        tag('h2', { id: 'detail-title', text: row.name }),
        tag('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      tag('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { detail.close(); } })
    ));
    detail.appendChild(tag('section', { class: 'detail-section' },
      tag('h3', { text: 'Implied value' }),
      tag('div', { class: 'equation' },
        tag('div', null, tag('span', { text: 'TVL' }), tag('b', { class: 'num', text: usdShort(row.tvl_usd) })),
        tag('div', null, tag('span', { text: 'Category multiple (' + (row.category || 'Other') + ')' }), tag('b', { class: 'num', text: String(row.category_multiple) })),
        tag('div', null, tag('span', { text: 'Seven-day growth' }), tag('b', { class: 'num', text: pctShort(row.change_7d) })),
        tag('div', null, tag('span', { text: 'Age with no token' }), tag('b', { class: 'num', text: ageShort(row.age_days) })),
        tag('div', null, tag('span', { text: 'Chains (' + (row.chains ? row.chains.length : 0) + ')' }), tag('b', { class: 'num', text: String(row.chain_multiplier) })),
        tag('div', null, tag('span', { text: 'Growth multiplier' }), tag('b', { class: 'num', text: String(row.growth_multiplier) })),
        tag('div', null, tag('span', { text: 'Maturity multiplier' }), tag('b', { class: 'num', text: String(row.maturity_multiplier) })),
        tag('div', null, tag('span', { text: 'Implied value' }), tag('b', { class: 'num', text: usdShort(row.implied_value_usd) }))
      ),
      tag('p', { class: 'sub', text: 'Model ' + BOARD.model_version + ': the same function scores every protocol. The page recomputes this row as ' + usdShort(recomputeValue(row, BOARD.model)) + (recomputeValue(row, BOARD.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    detail.appendChild(tag('section', { class: 'detail-section' },
      tag('h3', { text: 'Farm plan' }),
      tag('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return tag('li', null, tag('b', { text: action }), tag('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof detail.showModal === 'function') {
      if (!detail.open) detail.showModal();
    } else {
      detail.setAttribute('open', '');
    }
  }

  // --- Paint the page, and boot -----------------------------------------------------------------------
  function paint() {
    mount.textContent = '';
    var shell = tag('div', { class: 'shell' });
    shell.appendChild(topBar());
    shell.appendChild(intro());
    shell.appendChild(filterBar());
    shell.appendChild(ui.tab === 'pre-token' ? preTokenTable() : liveTokenTable());
    if (ui.tab === 'pre-token') shell.appendChild(modelExplainer());
    mount.appendChild(shell);
    mount.setAttribute('aria-busy', 'false');
    if (!detail.isConnected) mount.appendChild(detail);
    if (ui.selected) showDetail(ui.selected);
  }

  readLocation();
  paint();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && detail.open) detail.close();
  });
})();
