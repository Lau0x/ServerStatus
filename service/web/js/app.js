/* Server Status — front-end logic (vanilla, no deps) */
(function () {
  'use strict';

  var S = { servers: [], expanded: {}, filter: 'all', query: '', loaded: false, feedState: null };
  var POLL_INTERVAL_MS = 1500;
  var FETCH_TIMEOUT_MS = 10000;
  var STALE_AFTER_MS = 30000;
  var currentLanguage = 'en';

  var I18N = {
    en: {
      'brand.eyebrow': 'Fleet telemetry',
      'feed.connecting': 'Connecting to telemetry…',
      'feed.loading_fleet': 'Loading fleet telemetry…',
      'feed.unavailable': 'Data unavailable',
      'feed.using_data': 'Data unavailable · using data from {age}',
      'feed.stale': 'Stale data · {age}',
      'feed.loading': 'Loading…',
      'feed.updated': 'Updated {time}',
      'view.modern': 'Modern',
      'view.classic': 'Classic',
      'view.modern_title': 'Modern dashboard',
      'view.classic_title': 'Classic table',
      'view.group': 'Dashboard layout',
      'language.group': 'Language',
      'theme.group': 'Color theme',
      'theme.light': 'Light theme',
      'theme.dark': 'Dark theme',
      'theme.system': 'System theme',
      'metric.active': 'Active nodes',
      'metric.waiting': 'Waiting for telemetry',
      'metric.offline': 'Offline nodes',
      'metric.attention': 'need attention',
      'metric.offline_hint': 'Muted below, never hidden',
      'metric.health': 'Fleet health',
      'metric.availability': 'availability',
      'metric.telemetry': 'Telemetry',
      'metric.cadence': 'Live polling · 1.5 second cadence',
      'metric.reporting': '{online} of {total} nodes reporting',
      'status.online_lower': 'online',
      'status.online': 'Online',
      'status.offline': 'Offline',
      'panel.infrastructure': 'Infrastructure',
      'panel.overview': 'Node overview',
      'panel.fleet_overview': 'Fleet overview',
      'panel.health_map': 'Node health map',
      'panel.filter': 'Filter nodes',
      'panel.classic_table': 'Classic server status table',
      'search.placeholder': 'Search node or region',
      'search.label': 'Search nodes',
      'filter.all': 'All',
      'filter.online': 'Online',
      'filter.offline': 'Offline',
      'table.node': 'Node',
      'table.status': 'Status',
      'table.uptime': 'Uptime',
      'table.resources': 'Resources',
      'table.live_network': 'Live network',
      'table.traffic': 'Traffic',
      'table.latency': 'Latency',
      'classic.kicker': 'Classic monitor',
      'classic.all_servers': 'All servers',
      'classic.total_lower': 'total',
      'classic.protocol': 'Protocol',
      'classic.monthly': 'Monthly ↓↑',
      'classic.type': 'Type',
      'classic.region': 'Region',
      'classic.load': 'Load',
      'classic.network': 'Network ↓↑',
      'classic.total_traffic': 'Total ↓↑',
      'classic.disk': 'Disk',
      'classic.refresh': 'Refreshes every 1.5 seconds',
      'footer.built': 'Built on ServerStatus',
      'footer.source': 'View source',
      'node.unknown_region': 'Unknown region',
      'node.server': 'server',
      'protocol.dual': 'Dual stack',
      'protocol.dual_short': 'Dual',
      'telemetry.none': 'No telemetry',
      'telemetry.no_signal': 'No signal',
      'telemetry.no_traffic': 'No traffic',
      'traffic.cycle': 'Cycle',
      'latency.loss': '{value}% loss',
      'load.label': 'Load {value}',
      'empty.no_nodes': 'No nodes configured yet',
      'empty.no_match': 'No nodes match this view',
      'detail.network': 'Network down / up',
      'detail.memory': 'Memory / swap',
      'detail.disk': 'Disk / IO',
      'detail.sockets': 'Sockets / processes',
      'detail.processes': '{tcp} TCP · {udp} UDP · {processes} proc · {threads} threads',
      'uptime.days': '{days}d {hours}h',
      'uptime.hours': '{hours}h {minutes}m',
      'age.seconds': '{value}s ago',
      'age.minutes': '{value}m ago',
      'age.hours': '{value}h ago'
    },
    zh: {
      'brand.eyebrow': '集群遥测',
      'feed.connecting': '正在连接遥测数据…',
      'feed.loading_fleet': '正在加载集群数据…',
      'feed.unavailable': '数据不可用',
      'feed.using_data': '数据不可用 · 正在显示 {age}的数据',
      'feed.stale': '数据已过期 · {age}',
      'feed.loading': '加载中…',
      'feed.updated': '更新于 {time}',
      'view.modern': '现代',
      'view.classic': '经典',
      'view.modern_title': '现代仪表盘',
      'view.classic_title': '经典表格',
      'view.group': '面板布局',
      'language.group': '语言',
      'theme.group': '颜色主题',
      'theme.light': '明亮主题',
      'theme.dark': '深色主题',
      'theme.system': '跟随系统',
      'metric.active': '在线节点',
      'metric.waiting': '等待遥测数据',
      'metric.offline': '离线节点',
      'metric.attention': '需关注',
      'metric.offline_hint': '弱化显示，但不会隐藏',
      'metric.health': '集群健康',
      'metric.availability': '可用率',
      'metric.telemetry': '遥测状态',
      'metric.cadence': '实时轮询 · 每 1.5 秒更新',
      'metric.reporting': '{total} 个节点中 {online} 个在线',
      'status.online_lower': '在线',
      'status.online': '在线',
      'status.offline': '离线',
      'panel.infrastructure': '基础设施',
      'panel.overview': '节点概览',
      'panel.fleet_overview': '集群概览',
      'panel.health_map': '节点健康图',
      'panel.filter': '筛选节点',
      'panel.classic_table': '经典服务器状态表',
      'search.placeholder': '搜索节点或地区',
      'search.label': '搜索节点',
      'filter.all': '全部',
      'filter.online': '在线',
      'filter.offline': '离线',
      'table.node': '节点',
      'table.status': '状态',
      'table.uptime': '在线时长',
      'table.resources': '资源',
      'table.live_network': '实时网络',
      'table.traffic': '流量',
      'table.latency': '延迟',
      'classic.kicker': '经典监控',
      'classic.all_servers': '全部服务器',
      'classic.total_lower': '总数',
      'classic.protocol': '协议',
      'classic.monthly': '月流量 ↓↑',
      'classic.type': '类型',
      'classic.region': '地区',
      'classic.load': '负载',
      'classic.network': '网络 ↓↑',
      'classic.total_traffic': '总流量 ↓↑',
      'classic.disk': '硬盘',
      'classic.refresh': '每 1.5 秒刷新',
      'footer.built': '基于 ServerStatus 构建',
      'footer.source': '查看源码',
      'node.unknown_region': '未知地区',
      'node.server': '服务器',
      'protocol.dual': '双栈',
      'protocol.dual_short': '双栈',
      'telemetry.none': '暂无遥测数据',
      'telemetry.no_signal': '无网络信号',
      'telemetry.no_traffic': '无流量数据',
      'traffic.cycle': '周期',
      'latency.loss': '丢包 {value}%',
      'load.label': '负载 {value}',
      'empty.no_nodes': '尚未配置节点',
      'empty.no_match': '没有符合条件的节点',
      'detail.network': '网络下行 / 上行',
      'detail.memory': '内存 / 交换空间',
      'detail.disk': '硬盘 / IO',
      'detail.sockets': '连接 / 进程',
      'detail.processes': '{tcp} TCP · {udp} UDP · {processes} 进程 · {threads} 线程',
      'uptime.days': '{days} 天 {hours} 小时',
      'uptime.hours': '{hours} 小时 {minutes} 分钟',
      'age.seconds': '{value} 秒前',
      'age.minutes': '{value} 分钟前',
      'age.hours': '{value} 小时前'
    }
  };

  function normalizeLanguage(language) {
    return String(language || '').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
  }

  function initialLanguage(saved, browserLanguage) {
    if (saved === 'zh' || saved === 'en') return saved;
    return normalizeLanguage(browserLanguage);
  }

  function translate(language, key, values) {
    language = normalizeLanguage(language);
    var template = I18N[language][key] || I18N.en[key] || key;
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, name) {
      return values && values[name] != null ? String(values[name]) : '{' + name + '}';
    });
  }

  function t(key, values) { return translate(currentLanguage, key, values); }

  /* ----------------- theme: light / dark / system ----------------- */
  var THEME_KEY = 'theme';
  var mql = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : { matches: false };

  function effective(t) { return t === 'system' ? (mql.matches ? 'dark' : 'light') : t; }
  function getTheme() { return localStorage.getItem(THEME_KEY) || 'system'; }

  function applyTheme(t) {
    document.documentElement.dataset.theme = effective(t);
    var btns = document.querySelectorAll('[data-theme-choice]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.themeChoice === t);
    }
  }
  function setTheme(t) { localStorage.setItem(THEME_KEY, t); applyTheme(t); }

  function initTheme() {
    var btns = document.querySelectorAll('[data-theme-choice]');
    for (var i = 0; i < btns.length; i++) {
      (function (b) { b.addEventListener('click', function () { setTheme(b.dataset.themeChoice); }); })(btns[i]);
    }
    if (mql.addEventListener) {
      mql.addEventListener('change', function () { if (getTheme() === 'system') applyTheme('system'); });
    }
    applyTheme(getTheme());
  }

  /* ----------------- language: Chinese / English ----------------- */
  var LANGUAGE_KEY = 'serverstatus-language';

  function applyStaticTranslations() {
    var textNodes = document.querySelectorAll('[data-i18n]');
    var placeholderNodes = document.querySelectorAll('[data-i18n-placeholder]');
    var titleNodes = document.querySelectorAll('[data-i18n-title]');
    var ariaNodes = document.querySelectorAll('[data-i18n-aria]');
    var i;
    for (i = 0; i < textNodes.length; i++) textNodes[i].textContent = t(textNodes[i].dataset.i18n);
    for (i = 0; i < placeholderNodes.length; i++) placeholderNodes[i].setAttribute('placeholder', t(placeholderNodes[i].dataset.i18nPlaceholder));
    for (i = 0; i < titleNodes.length; i++) titleNodes[i].setAttribute('title', t(titleNodes[i].dataset.i18nTitle));
    for (i = 0; i < ariaNodes.length; i++) ariaNodes[i].setAttribute('aria-label', t(ariaNodes[i].dataset.i18nAria));
  }

  function applyLanguage(language) {
    currentLanguage = normalizeLanguage(language);
    document.documentElement.dataset.language = currentLanguage;
    document.documentElement.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en';
    var buttons = document.querySelectorAll('[data-language-choice]');
    for (var i = 0; i < buttons.length; i++) {
      var active = buttons[i].dataset.languageChoice === currentLanguage;
      buttons[i].classList.toggle('active', active);
      buttons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    applyStaticTranslations();
    if (S.loaded) {
      updateSummary();
      renderRows();
      renderClassicRows();
    }
    if (S.feedState) renderFeedStatus(S.feedState);
  }

  function setLanguage(language) {
    language = normalizeLanguage(language);
    localStorage.setItem(LANGUAGE_KEY, language);
    applyLanguage(language);
  }

  function initLanguage() {
    var buttons = document.querySelectorAll('[data-language-choice]');
    for (var i = 0; i < buttons.length; i++) {
      (function (button) {
        button.addEventListener('click', function () { setLanguage(button.dataset.languageChoice); });
      })(buttons[i]);
    }
    applyLanguage(initialLanguage(
      localStorage.getItem(LANGUAGE_KEY),
      navigator.language || navigator.userLanguage || 'en'
    ));
  }

  /* ----------------- layout: modern / classic ----------------- */
  var LAYOUT_KEY = 'serverstatus-layout';

  function normalizeLayout(layout) { return layout === 'classic' ? 'classic' : 'modern'; }
  function initialLayout(layout) { return layout == null || layout === '' ? 'classic' : normalizeLayout(layout); }
  function getLayout() { return initialLayout(localStorage.getItem(LAYOUT_KEY)); }

  function applyLayout(layout) {
    layout = normalizeLayout(layout);
    document.documentElement.dataset.layout = layout;
    var buttons = document.querySelectorAll('[data-layout-choice]');
    for (var i = 0; i < buttons.length; i++) {
      var active = buttons[i].dataset.layoutChoice === layout;
      buttons[i].classList.toggle('active', active);
      buttons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function setLayout(layout) {
    layout = normalizeLayout(layout);
    localStorage.setItem(LAYOUT_KEY, layout);
    applyLayout(layout);
  }

  function initLayout() {
    var buttons = document.querySelectorAll('[data-layout-choice]');
    for (var i = 0; i < buttons.length; i++) {
      (function (button) {
        button.addEventListener('click', function () { setLayout(button.dataset.layoutChoice); });
      })(buttons[i]);
    }
    applyLayout(getLayout());
  }

  /* ----------------- formatting helpers ----------------- */
  function humanBytes(b) {
    b = Number(b) || 0;
    if (b <= 0) return '0';
    var u = ['B', 'K', 'M', 'G', 'T', 'P'], i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return (b >= 100 || i === 0 ? b.toFixed(0) : b.toFixed(1)) + u[i];
  }
  function humanSpeed(b) { var s = humanBytes(b); return s === '0' ? '0' : s + '/s'; }

  function pct(used, total) {
    used = Number(used); total = Number(total);
    if (!total || total <= 0) return 0;
    return Math.max(0, Math.min(100, used / total * 100));
  }

  function flag(loc) {
    if (!loc) return '';
    var m = String(loc).trim().slice(0, 2).toLowerCase();
    if (!/^[a-z]{2}$/.test(m)) return '';
    return String.fromCodePoint(0x1F1E6 + m.charCodeAt(0) - 97, 0x1F1E6 + m.charCodeAt(1) - 97);
  }

  function fmtUptime(v) {
    if (typeof v !== 'number') return v ? String(v) : '-';
    if (v <= 0) return '-';
    var d = Math.floor(v / 86400), h = Math.floor((v % 86400) / 3600);
    if (d > 0) return t('uptime.days', { days: d, hours: h });
    var m = Math.floor((v % 3600) / 60);
    return t('uptime.hours', { hours: h, minutes: m });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function serverOnline(server) {
    return !!(server && (server.online4 || server.online6));
  }

  function fleetSummary(servers) {
    servers = Array.isArray(servers) ? servers : [];
    var online = 0;
    for (var i = 0; i < servers.length; i++) if (serverOnline(servers[i])) online++;
    return {
      total: servers.length,
      online: online,
      offline: servers.length - online,
      health: servers.length ? Math.round(online / servers.length * 100) : 0
    };
  }

  function filterServers(servers, filter, query) {
    query = String(query || '').trim().toLowerCase();
    return (servers || []).filter(function (server) {
      var online = serverOnline(server);
      if (filter === 'online' && !online) return false;
      if (filter === 'offline' && online) return false;
      if (!query) return true;
      return [server.name, server.location, server.type]
        .join(' ').toLowerCase().indexOf(query) !== -1;
    });
  }

  /* ----------------- status feed ----------------- */
  function updatedMillis(value) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return null;
    return n < 1000000000000 ? n * 1000 : n;
  }

  function updateFeedState(state, result, now) {
    if (result.ok) {
      return {
        data: result.data,
        lastSuccess: now,
        sourceUpdated: updatedMillis(result.data && result.data.updated),
        error: null
      };
    }
    return {
      data: state.data,
      lastSuccess: state.lastSuccess,
      sourceUpdated: state.sourceUpdated,
      error: result.error || new Error('stats unavailable')
    };
  }

  function ageText(ms, language) {
    var seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) return translate(language, 'age.seconds', { value: seconds });
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return translate(language, 'age.minutes', { value: minutes });
    return translate(language, 'age.hours', { value: Math.floor(minutes / 60) });
  }

  function feedNotice(state, now, staleAfter, language) {
    language = normalizeLanguage(language);
    if (state.error) {
      var lastDataTime = state.sourceUpdated == null ? state.lastSuccess : state.sourceUpdated;
      return {
        kind: 'error',
        text: lastDataTime == null
          ? translate(language, 'feed.unavailable')
          : translate(language, 'feed.using_data', { age: ageText(now - lastDataTime, language) })
      };
    }
    if (state.sourceUpdated != null && now - state.sourceUpdated > staleAfter) {
      return { kind: 'stale', text: translate(language, 'feed.stale', { age: ageText(now - state.sourceUpdated, language) }) };
    }
    var updated = state.sourceUpdated == null ? state.lastSuccess : state.sourceUpdated;
    return {
      kind: 'ok',
      text: updated == null
        ? translate(language, 'feed.loading')
        : translate(language, 'feed.updated', {
          time: new Date(updated).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US')
        })
    };
  }

  function renderFeedStatus(state) {
    var notice = feedNotice(state, Date.now(), STALE_AFTER_MS, currentLanguage);
    document.getElementById('updated').textContent = notice.text;
    document.getElementById('classic-updated').textContent = notice.text;
    document.getElementById('feed-status').className = 'feed-status ' + notice.kind;
  }

  function fetchStats(fetchFn, now, timeoutMs, AbortControllerImpl) {
    timeoutMs = timeoutMs == null ? FETCH_TIMEOUT_MS : timeoutMs;
    var Controller = AbortControllerImpl === undefined
      ? (typeof AbortController === 'undefined' ? null : AbortController)
      : AbortControllerImpl;
    var controller = Controller ? new Controller() : null;
    var requestOptions = { cache: 'no-store' };
    if (controller) requestOptions.signal = controller.signal;
    var timer;
    var timeout = new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('stats request timed out'));
      }, timeoutMs);
    });
    var request;
    try {
      request = Promise.resolve(fetchFn('json/stats.json?_=' + now, requestOptions));
    } catch (error) {
      request = Promise.reject(error);
    }
    request = request
      .then(function (response) {
        if (!response.ok) throw new Error('stats HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.servers)) throw new Error('stats missing servers');
        return data;
      });
    return Promise.race([request, timeout])
      .finally(function () { clearTimeout(timer); });
  }

  function createStatusPoller(options) {
    var state = { data: null, lastSuccess: null, sourceUpdated: null, error: null };
    var inFlight = null;
    var timer = null;
    var stopped = false;
    var fetchFn = options.fetch;
    var nowFn = options.now || Date.now;
    var schedule = options.schedule || setTimeout;
    var cancel = options.cancel || clearTimeout;

    function run() {
      if (inFlight) return inFlight;
      var startedAt = nowFn();
      inFlight = fetchStats(fetchFn, startedAt, options.timeout)
        .then(function (data) {
          state = updateFeedState(state, { ok: true, data: data }, nowFn());
          options.onData(data);
        })
        .catch(function (error) {
          state = updateFeedState(state, { ok: false, error: error }, nowFn());
        })
        .finally(function () {
          options.onState(state);
          inFlight = null;
          if (!stopped) timer = schedule(run, options.interval);
        });
      return inFlight;
    }

    return {
      start: function () { stopped = false; return run(); },
      run: run,
      stop: function () {
        stopped = true;
        if (timer != null) cancel(timer);
      },
      getState: function () { return state; }
    };
  }

  /* ----------------- cell builders ----------------- */
  function protocolLabel(server, online) {
    if (!online) return t('status.offline');
    if (server.online4 && server.online6) return t('protocol.dual');
    return server.online4 ? 'IPv4' : 'IPv6';
  }

  function nodeCell(server, online) {
    var name = String(server.name || '-');
    var initial = name.trim().charAt(0).toUpperCase() || 'N';
    var location = server.location ? flag(server.location) + ' ' + esc(server.location) : t('node.unknown_region');
    var type = server.type ? esc(server.type) : t('node.server');
    return '<div class="node-cell">' +
      '<span class="node-icon">' + esc(initial) + '</span>' +
      '<span class="node-copy"><span class="node-name">' + esc(name) + '</span>' +
      '<span class="node-meta"><span>' + location + '</span><span class="meta-sep">/</span><span>' + type + '</span></span></span></div>';
  }

  function statusCell(server, online) {
    return '<div class="status-stack"><span class="status-badge' + (online ? '' : ' offline') + '">' +
      (online ? t('status.online') : t('status.offline')) + '</span><span class="protocol">' + protocolLabel(server, online) + '</span></div>';
  }

  function severity(value) { return value >= 90 ? ' bad' : value >= 70 ? ' warn' : ''; }
  function resourceLine(label, value, kind) {
    value = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    return '<div class="resource-line ' + kind + severity(value) + '">' +
      '<span class="resource-label">' + label + '</span>' +
      '<span class="resource-track"><span class="resource-fill" style="--value:' + value + '"></span></span>' +
      '<span class="resource-value">' + value + '%</span></div>';
  }

  function resourceCell(cpu, memory, disk, online) {
    if (!online) return '<span class="dim">' + t('telemetry.none') + '</span>';
    return '<div class="resource-stack">' + resourceLine('CPU', cpu, 'cpu') +
      resourceLine('RAM', memory, 'ram') + resourceLine('SSD', disk, 'disk') + '</div>';
  }

  function networkCell(server, online) {
    if (!online) return '<span class="dim">' + t('telemetry.no_signal') + '</span>';
    return '<div class="network-cell">' +
      '<span class="flow-line"><span class="flow-arrow">↑</span><span class="flow-value">' + humanSpeed(server.network_tx) + '</span></span>' +
      '<span class="flow-line down"><span class="flow-arrow">↓</span><span class="flow-value">' + humanSpeed(server.network_rx) + '</span></span></div>';
  }

  function trafficCell(server, monthIn, monthOut, online) {
    if (!online) return '<span class="dim">' + t('telemetry.no_traffic') + '</span>';
    return '<div class="traffic-cell"><span class="traffic-main">↓ ' + humanBytes(server.network_in) + ' · ↑ ' + humanBytes(server.network_out) + '</span>' +
      '<span class="traffic-sub">' + t('traffic.cycle') + ' ↓ ' + humanBytes(monthIn) + ' · ↑ ' + humanBytes(monthOut) + '</span></div>';
  }

  function latencyPill(label, time, loss, online) {
    time = Number(time); loss = Number(loss);
    if (!online || !isFinite(time) || time < 0) {
      return '<span class="latency-pill"><span class="latency-label">' + label + '</span><span class="latency-ms dim">–</span></span>';
    }
    if (!isFinite(loss) || loss < 0) loss = 0;
    var cls = loss >= 50 ? ' bad' : loss > 0 ? ' mid' : '';
    var lossText = loss > 0 && loss < 1 ? loss.toFixed(1) : Math.round(loss);
    return '<span class="latency-pill' + cls + '"><span class="latency-label">' + label + '</span>' +
      '<span class="latency-ms">' + Math.round(time) + 'ms</span><span class="latency-loss">' + t('latency.loss', { value: lossText }) + '</span></span>';
  }

  function latencyCell(server, online) {
    return '<div class="latency-grid">' +
      latencyPill('CU', server.time_10010, server.ping_10010, online) +
      latencyPill('CT', server.time_189, server.ping_189, online) +
      latencyPill('CM', server.time_10086, server.ping_10086, online) + '</div>';
  }

  function classicProtocolLabel(server, online) {
    if (!online) return t('status.offline');
    if (server.online4 && server.online6) return t('protocol.dual_short');
    return server.online4 ? 'IPv4' : 'IPv6';
  }

  function classicMeter(value, online) {
    value = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    if (!online) return '<div class="classic-meter offline"><span>' + t('status.offline') + '</span></div>';
    var level = value >= 90 ? ' bad' : value >= 70 ? ' warn' : '';
    return '<div class="classic-meter' + level + '" style="--value:' + value + '"><span>' + value + '%</span></div>';
  }

  function classicCarrier(server, online) {
    if (!online) return '<div class="carrier-cell bad">' + t('status.offline') + '</div>';
    var cu = Math.max(0, Number(server.ping_10010) || 0);
    var ct = Math.max(0, Number(server.ping_189) || 0);
    var cm = Math.max(0, Number(server.ping_10086) || 0);
    var worst = Math.max(cu, ct, cm);
    var level = worst >= 50 ? ' bad' : worst > 0 ? ' warn' : '';
    var title = 'CU ' + pingPart(server.time_10010, cu) + ' · CT ' + pingPart(server.time_189, ct) + ' · CM ' + pingPart(server.time_10086, cm);
    return '<div class="carrier-cell' + level + '" title="' + esc(title) + '">' +
      '<b>CU</b> ' + Math.round(cu) + '% · <b>CT</b> ' + Math.round(ct) + '% · <b>CM</b> ' + Math.round(cm) + '%</div>';
  }

  function classicRow(server) {
    var online = serverOnline(server);
    var memPct = pct(server.memory_used, server.memory_total);
    var diskPct = pct(server.hdd_used, server.hdd_total);
    var monthIn = (Number(server.network_in) || 0) - (Number(server.last_network_in) || 0);
    var monthOut = (Number(server.network_out) || 0) - (Number(server.last_network_out) || 0);
    var load = Number(server.load_1) === -1 ? '–' : Math.max(0, Number(server.load_1) || 0).toFixed(2);
    var protocol = classicProtocolLabel(server, online);
    var monthly = online ? humanBytes(monthIn) + ' | ' + humanBytes(monthOut) : t('status.offline');
    var network = online ? humanSpeed(server.network_rx) + ' | ' + humanSpeed(server.network_tx) : '–';
    var total = online ? humanBytes(server.network_in) + ' | ' + humanBytes(server.network_out) : '–';
    return '<tr class="classic-row' + (online ? '' : ' classic-offline') + '">' +
      '<td><span class="classic-cell' + (online ? '' : ' offline') + '">' + protocol + '</span></td>' +
      '<td><span class="classic-cell monthly' + (online ? '' : ' offline') + '">' + monthly + '</span></td>' +
      '<td><span class="classic-name" title="' + esc(server.name || '-') + '">' + esc(server.name || '-') + '</span></td>' +
      '<td><span class="classic-type">' + esc(server.type || '–') + '</span></td>' +
      '<td><span class="classic-region">' + esc(String(server.location || '–').toUpperCase()) + '</span></td>' +
      '<td><span class="classic-number">' + (online ? esc(fmtUptime(server.uptime)) : '–') + '</span></td>' +
      '<td><span class="classic-number">' + (online ? load : '–') + '</span></td>' +
      '<td><span class="classic-flow">' + network + '</span></td>' +
      '<td><span class="classic-flow">' + total + '</span></td>' +
      '<td>' + classicMeter(server.cpu, online) + '</td>' +
      '<td>' + classicMeter(memPct, online) + '</td>' +
      '<td>' + classicMeter(diskPct, online) + '</td>' +
      '<td>' + classicCarrier(server, online) + '</td></tr>';
  }

  /* ----------------- render ----------------- */
  var CELL_LABEL_KEYS = ['table.node', 'table.status', 'table.uptime', 'table.resources', 'table.live_network', 'table.traffic', 'table.latency'];

  function computeCells(s) {
    var online = serverOnline(s);
    var memPct = pct(s.memory_used, s.memory_total);
    var hddPct = pct(s.hdd_used, s.hdd_total);
    var mIn = (Number(s.network_in) || 0) - (Number(s.last_network_in) || 0);
    var mOut = (Number(s.network_out) || 0) - (Number(s.last_network_out) || 0);
    var load = (Number(s.load_1) === -1) ? '–' : Math.max(0, Number(s.load_1) || 0).toFixed(2);
    var cpuVal = Math.max(0, Number(s.cpu) || 0);
    return { online: online, cells: [
      nodeCell(s, online),
      statusCell(s, online),
      '<span class="uptime">' + esc(fmtUptime(s.uptime)) + '<small>' + t('load.label', { value: load }) + '</small></span>',
      resourceCell(cpuVal, memPct, hddPct, online),
      networkCell(s, online),
      trafficCell(s, mIn, mOut, online),
      latencyCell(s, online)
    ] };
  }

  function row(s) {
    var c = computeCells(s);
    var cells = c.cells.map(function (cell, index) {
      return '<td data-label="' + esc(t(CELL_LABEL_KEYS[index])) + '">' + cell + '</td>';
    }).join('');
    return '<tr class="row' + (c.online ? '' : ' offline') + '" data-name="' + esc(s.name || '') + '">' + cells + '</tr>';
  }

  // 节点集合(名字与顺序)是否与当前 DOM 一致 → 决定整建 or 就地更新
  function sameRowSet(servers) {
    var rows = document.querySelectorAll('#rows tr.row[data-name]');
    if (rows.length !== servers.length) return false;
    for (var i = 0; i < servers.length; i++) {
      if ((servers[i].name || '') !== rows[i].getAttribute('data-name')) return false;
    }
    return true;
  }

  function updateRows(servers) {
    var rowsEl = document.getElementById('rows');
    var rows = rowsEl.querySelectorAll('tr.row[data-name]');
    var map = {};
    for (var i = 0; i < rows.length; i++) map[rows[i].getAttribute('data-name')] = rows[i];
    for (var k = 0; k < servers.length; k++) {
      var s = servers[k], tr = map[s.name || ''];
      if (!tr) continue;
      var c = computeCells(s);
      tr.classList.toggle('offline', !c.online);
      var tds = tr.children;
      for (var tIndex = 0; tIndex < tds.length && tIndex < c.cells.length; tIndex++) {
        tds[tIndex].setAttribute('data-label', t(CELL_LABEL_KEYS[tIndex]));
        tds[tIndex].innerHTML = c.cells[tIndex];
      }
      var ex = tr.nextElementSibling;
      if (ex && ex.classList && ex.classList.contains('exrow')) ex.firstElementChild.innerHTML = detailHTML(s);
    }
  }

  function renderRows() {
    var visible = filterServers(S.servers, S.filter, S.query);
    var rowsEl = document.getElementById('rows');
    if (!S.servers.length) {
      rowsEl.innerHTML = '<tr class="empty"><td colspan="7">' + t('empty.no_nodes') + '</td></tr>';
    } else if (!visible.length) {
      rowsEl.innerHTML = '<tr class="empty"><td colspan="7">' + t('empty.no_match') + '</td></tr>';
    } else if (sameRowSet(visible)) {
      updateRows(visible);
    } else {
      rowsEl.innerHTML = visible.map(function (server) { return row(server) + exrow(server); }).join('');
    }
    applyExpanded();
  }

  function renderClassicRows() {
    var rows = document.getElementById('classic-rows');
    if (!S.servers.length) {
      rows.innerHTML = '<tr class="classic-empty"><td colspan="13">' + t('empty.no_nodes') + '</td></tr>';
      return;
    }
    rows.innerHTML = S.servers.map(function (server) { return classicRow(server); }).join('');
  }

  function updateSummary() {
    var summary = fleetSummary(S.servers);
    document.getElementById('metric-online').textContent = summary.online;
    document.getElementById('metric-offline').textContent = summary.offline;
    document.getElementById('metric-health').textContent = summary.health + '%';
    document.getElementById('online-caption').textContent = summary.total
      ? t('metric.reporting', { online: summary.online, total: summary.total })
      : t('metric.waiting');
    document.getElementById('filter-all-count').textContent = summary.total;
    document.getElementById('filter-online-count').textContent = summary.online;
    document.getElementById('filter-offline-count').textContent = summary.offline;
    document.getElementById('classic-online').textContent = summary.online;
    document.getElementById('classic-total').textContent = summary.total;

    document.getElementById('fleet-grid').innerHTML = S.servers.map(function (server) {
      return '<span class="' + (serverOnline(server) ? 'online' : 'offline') + '" title="' + esc(server.name || t('table.node')) + '"></span>';
    }).join('');
  }

  function render(j) {
    S.servers = ((j && j.servers) || []).slice().sort(function (a, b) {
      return String(a && a.name || '').localeCompare(String(b && b.name || ''));
    });
    S.loaded = true;
    updateSummary();
    renderRows();
    renderClassicRows();
  }

  function initFilters() {
    var buttons = document.querySelectorAll('[data-filter]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        S.filter = this.dataset.filter;
        for (var j = 0; j < buttons.length; j++) buttons[j].classList.toggle('active', buttons[j] === this);
        renderRows();
      });
    }
    document.getElementById('node-search').addEventListener('input', function () {
      S.query = this.value;
      renderRows();
    });
  }

  /* ----------------- expandable detail row ----------------- */
  function findServer(name) {
    for (var i = 0; i < S.servers.length; i++) if ((S.servers[i].name || '') === name) return S.servers[i];
    return null;
  }
  function pingPart(t, l) {
    t = Number(t); l = Number(l);
    return (isNaN(t) ? 0 : t) + 'ms (' + (isNaN(l) ? 0 : Math.round(l)) + '%)';
  }
  function seg(label, val) { return '<span class="detail-item"><b>' + label + '</b><span>' + val + '</span></span>'; }

  function detailHTML(s) {
    var KB = 1024, MB = 1048576;
    var io = humanSpeed(s.io_read) + ' / ' + humanSpeed(s.io_write);
    return '<div class="detail-grid">'
      + seg(t('detail.network'), humanSpeed(s.network_rx) + ' / ' + humanSpeed(s.network_tx))
      + seg(t('detail.memory'), humanBytes((Number(s.memory_used) || 0) * KB) + ' / ' + humanBytes((Number(s.memory_total) || 0) * KB) + ' · ' + humanBytes((Number(s.swap_used) || 0) * KB) + ' / ' + humanBytes((Number(s.swap_total) || 0) * KB))
      + seg(t('detail.disk'), humanBytes((Number(s.hdd_used) || 0) * MB) + ' / ' + humanBytes((Number(s.hdd_total) || 0) * MB) + ' · ' + io)
      + seg(t('detail.sockets'), t('detail.processes', { tcp: Number(s.tcp_count) || 0, udp: Number(s.udp_count) || 0, processes: Number(s.process_count) || 0, threads: Number(s.thread_count) || 0 }))
      + seg('CU/CT/CM', pingPart(s.time_10010, s.ping_10010) + ' / ' + pingPart(s.time_189, s.ping_189) + ' / ' + pingPart(s.time_10086, s.ping_10086))
      + '</div>';
  }
  function exrow(s) {
    var name = s.name || '';
    var open = (s.online4 || s.online6) && S.expanded[name];
    return '<tr class="exrow" data-for="' + esc(name) + '"' + (open ? '' : ' hidden') + '><td colspan="7">' + detailHTML(s) + '</td></tr>';
  }
  function applyExpanded() {
    var rows = document.querySelectorAll('#rows .exrow');
    for (var i = 0; i < rows.length; i++) {
      var n = rows[i].getAttribute('data-for');
      var open = !!S.expanded[n];
      if (open) rows[i].removeAttribute('hidden'); else rows[i].setAttribute('hidden', '');
      var main = rows[i].previousElementSibling;   // 对应主行: 展开时隐藏二者之间的分隔线
      if (main && main.classList && main.classList.contains('row')) main.classList.toggle('open', open);
    }
  }
  function toggleExpand(name) {
    var s = findServer(name);
    if (!s || !serverOnline(s)) return;
    if (S.expanded[name]) delete S.expanded[name]; else S.expanded[name] = true;
    applyExpanded();
  }
  function initExpand() {
    document.getElementById('rows').addEventListener('click', function (e) {
      var tr = e.target.closest('tr.row[data-name]');
      if (tr) toggleExpand(tr.getAttribute('data-name'));
    });
  }

  /* ----------------- boot ----------------- */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      updatedMillis: updatedMillis,
      updateFeedState: updateFeedState,
      feedNotice: feedNotice,
      fetchStats: fetchStats,
      createStatusPoller: createStatusPoller,
      fleetSummary: fleetSummary,
      filterServers: filterServers,
      normalizeLayout: normalizeLayout,
      initialLayout: initialLayout,
      normalizeLanguage: normalizeLanguage,
      initialLanguage: initialLanguage,
      translate: translate,
      classicRow: classicRow
    };
  }

  if (typeof document !== 'undefined') {
    initLanguage();
    initLayout();
    initTheme();
    initExpand();
    initFilters();
    createStatusPoller({
      fetch: fetch.bind(window),
      interval: POLL_INTERVAL_MS,
      timeout: FETCH_TIMEOUT_MS,
      onData: render,
      onState: function (state) {
        S.feedState = state;
        renderFeedStatus(state);
      }
    }).start();
  }
})();
