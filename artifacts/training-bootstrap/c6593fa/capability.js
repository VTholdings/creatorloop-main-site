var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../../../../../step18-managed-tools/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// ../../../../../step18-managed-tools/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// ../../../../../step18-managed-tools/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// ../../../../../step18-managed-tools/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// ../../../../../step18-managed-tools/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var isWorkerdProcessV2 = globalThis.Cloudflare.compatibilityFlags.enable_nodejs_process_v2;
var unenvProcess = new Process({
  env: globalProcess.env,
  // `hrtime` is only available from workerd process v2
  hrtime: isWorkerdProcessV2 ? workerdProcess.hrtime : hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  // Always implemented by workerd
  env,
  // Only implemented in workerd v2
  hrtime: hrtime3,
  // Always implemented by workerd
  nextTick
} = unenvProcess;
var {
  _channel,
  _disconnect,
  _events,
  _eventsCount,
  _handleQueue,
  _maxListeners,
  _pendingMessage,
  _send,
  assert: assert2,
  disconnect,
  mainModule
} = unenvProcess;
var {
  // @ts-expect-error `_debugEnd` is missing typings
  _debugEnd,
  // @ts-expect-error `_debugProcess` is missing typings
  _debugProcess,
  // @ts-expect-error `_exiting` is missing typings
  _exiting,
  // @ts-expect-error `_fatalException` is missing typings
  _fatalException,
  // @ts-expect-error `_getActiveHandles` is missing typings
  _getActiveHandles,
  // @ts-expect-error `_getActiveRequests` is missing typings
  _getActiveRequests,
  // @ts-expect-error `_kill` is missing typings
  _kill,
  // @ts-expect-error `_linkedBinding` is missing typings
  _linkedBinding,
  // @ts-expect-error `_preload_modules` is missing typings
  _preload_modules,
  // @ts-expect-error `_rawDebug` is missing typings
  _rawDebug,
  // @ts-expect-error `_startProfilerIdleNotifier` is missing typings
  _startProfilerIdleNotifier,
  // @ts-expect-error `_stopProfilerIdleNotifier` is missing typings
  _stopProfilerIdleNotifier,
  // @ts-expect-error `_tickCallback` is missing typings
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  availableMemory,
  // @ts-expect-error `binding` is missing typings
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  // @ts-expect-error `domain` is missing typings
  domain,
  emit,
  emitWarning,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  // @ts-expect-error `initgroups` is missing typings
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  memoryUsage,
  // @ts-expect-error `moduleLoadList` is missing typings
  moduleLoadList,
  off,
  on,
  once,
  // @ts-expect-error `openStdin` is missing typings
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  // @ts-expect-error `reallyExit` is missing typings
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = isWorkerdProcessV2 ? workerdProcess : unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// ../../../../../step18-managed-tools/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// ../../../workers/training-managed/capability.mjs
import { DurableObject } from "cloudflare:workers";

// ../../../scripts/lib/training-mediated-dispatcher.mjs
import { createHash as createHash2 } from "node:crypto";

// ../../../scripts/lib/training-execution-contract.mjs
import { createHash } from "node:crypto";
var TRAINING_TARGET = Object.freeze({
  accountId: "2a3b96a0b37850cd03107131baa66b6d",
  project: "creatorloop-operator-training",
  projectId: "9863d88c-8025-414c-9524-078ee470e9e7",
  appId: "72da9ab5-d951-4de4-8456-fd6660e4d86e",
  databaseId: "12dbfa51-ca9c-475b-bb1b-ca90ac8bd7f0",
  audience: "a6b7d2d9e2a0bbe45ac1f1155cbd32593467eac2d66c01aa67d36fb290b7a38d",
  deploymentId: "9863d88c-8025-414c-9524-078ee470e9e7"
});
var sha256 = /* @__PURE__ */ __name((value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex"), "sha256");
function refuse(code) {
  throw Error(code);
}
__name(refuse, "refuse");
var nonempty = /* @__PURE__ */ __name((v) => typeof v === "string" && v.trim() === v && v.length > 0, "nonempty");
var requestFields = ["id", "operation", "operatorId", "email", "environment", "audience", "databaseId", "deploymentId", "requestVersion", "requestedAt"];
function validateManifest(m, now = Math.floor(Date.now() / 1e3)) {
  if (!m || m.protocol !== "CREATORLOOP_TRAINING_EXECUTION_V1" || m.environment !== "TRAINING" || !m.targets || Object.entries(TRAINING_TARGET).some(([key, value]) => m.targets[key] !== value)) refuse("TRAINING_TARGET_REFUSED");
  if (!nonempty(m.ownerDecisionRef) || !nonempty(m.executorPrincipal) || !nonempty(m.signerPrincipal) || m.executorPrincipal === m.signerPrincipal || !nonempty(m.runnerRef) || !nonempty(m.providerCredentialRef) || !nonempty(m.signerKeyRef) || !nonempty(m.keyId)) refuse("CUSTODY_PREREQUISITES_MISSING");
  if (!/^[a-f0-9]{40}$/.test(m.executionSha || "") || !Number.isInteger(m.approvedAt) || !Number.isInteger(m.expiresAt) || m.approvedAt > now || m.expiresAt <= now || m.expiresAt - m.approvedAt > 3600) refuse("EXECUTION_WINDOW_REFUSED");
  if (!m.subject || !nonempty(m.subject.operatorId) || !nonempty(m.subject.subject) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.subject.email || "") || m.subject.email !== m.subject.email.toLowerCase() || ["team@creatorloop.net", "support@creatorloop.net"].includes(m.subject.email) || m.subject.trainingOnly !== true || m.subject.crossApplicationRevocationAccepted !== true) refuse("INDIVIDUAL_SUBJECT_REFUSED");
  if (!/^[a-f0-9]{64}$/.test(m.preservedPoliciesHash || "") || !Array.isArray(m.requireRules) || !m.requireRules.length || !Number.isInteger(m.policyPrecedence) || m.policyPrecedence < 0 || !["ADMIT", "REVOKE"].includes(m.operation) || !nonempty(m.requestId) || !Number.isInteger(m.requestVersion) || m.requestVersion < 0) refuse("REQUEST_APPROVAL_MISSING");
  if (!Number.isInteger(m.requestedAt) || m.requestedAt > now) refuse("APPROVED_REQUEST_TIME_REQUIRED");
  if (!/^[a-f0-9]{40}$/.test(m.applicationSha || "") || m.requireRules.some((rule) => !rule || Object.keys(rule).length !== 1 || JSON.stringify(rule).match(/everyone|service_token|email_domain|bypass/i))) refuse("APPROVED_POLICY_REQUIREMENTS_REFUSED");
  if (m.operation === "REVOKE" && !/^[a-f0-9-]{36}$/.test(m.ownedPolicyId || "")) refuse("OWNED_POLICY_ID_REQUIRED");
  return m;
}
__name(validateManifest, "validateManifest");
function validateRequest(r, m, now = Math.floor(Date.now() / 1e3)) {
  validateManifest(m, now);
  if (!r || Object.keys(r).some((k) => !requestFields.includes(k) && k !== "reason") || r.reason !== void 0 && (typeof r.reason !== "string" || !r.reason.trim()) || requestFields.some((k) => r[k] === void 0) || r.id !== m.requestId || r.operation !== m.operation || r.operatorId !== m.subject.operatorId || r.email !== m.subject.email || r.requestVersion !== m.requestVersion || r.environment !== "TRAINING" || r.audience !== TRAINING_TARGET.audience || r.databaseId !== TRAINING_TARGET.databaseId || r.deploymentId !== TRAINING_TARGET.deploymentId || !Number.isInteger(r.requestedAt) || r.requestedAt > now || r.requestedAt !== m.requestedAt) refuse("INDIVIDUAL_REQUEST_REFUSED");
  return r;
}
__name(validateRequest, "validateRequest");
async function fence(r, m, { readCurrentRequest, verifyApproval, now }) {
  validateRequest(r, m, now());
  const approval = await verifyApproval({ manifest: structuredClone(m), manifestHash: sha256(m) });
  if (!approval || approval.manifestHash !== sha256(m) || approval.ownerDecisionRef !== m.ownerDecisionRef || approval.executionSha !== m.executionSha || approval.independentCustodyEnforced !== true || approval.providerCapabilityVerified !== true || approval.signerPrincipal !== m.signerPrincipal || approval.executorPrincipal !== m.executorPrincipal) refuse("PROTECTED_APPROVAL_NOT_VERIFIED");
  const current = await readCurrentRequest(r.operatorId);
  if (!current || current.personnelVersion !== r.requestVersion || requestFields.some((key) => current.request?.[key] !== r[key])) refuse("CURRENT_REQUEST_FENCE_FAILED");
}
__name(fence, "fence");
function policyTemplate(m) {
  return { name: "CL-TRAINING-" + m.subject.operatorId, decision: "allow", include: [{ email: { email: m.subject.email } }], require: structuredClone(m.requireRules), exclude: [], precedence: m.policyPrecedence, session_duration: "1h" };
}
__name(policyTemplate, "policyTemplate");
function ownPolicy(policy, m) {
  const desired = policyTemplate(m);
  return policy && Object.entries(desired).every(([key, value]) => JSON.stringify(policy[key]) === JSON.stringify(value));
}
__name(ownPolicy, "ownPolicy");
function preservedHash(policies, m) {
  const other = policies.filter((p) => !ownPolicy(p, m)).map((p) => structuredClone(p)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return sha256(other);
}
__name(preservedHash, "preservedHash");
function verifySession(proof, r, m, now, operation = r.operation) {
  if (!proof || proof.operation !== operation || proof.email !== m.subject.email || proof.subject !== m.subject.subject || proof.environment !== "TRAINING" || proof.audience !== TRAINING_TARGET.audience || proof.issuer !== `https://shiny-wildflower-143c.cloudflareaccess.com` || proof.identityBased !== true || proof.independentlyVerified !== true || !Number.isInteger(proof.observedAt) || proof.observedAt < r.requestedAt || proof.observedAt > now || proof.observedAt < now - 300) refuse("INDEPENDENT_SESSION_PROOF_REQUIRED");
  if (operation === "ADMIT" && (proof.freshLoginVerified !== true || proof.signatureVerified !== true || !Number.isInteger(proof.issuedAt) || proof.issuedAt < r.requestedAt || proof.issuedAt > now || !Number.isInteger(proof.expiresAt) || proof.expiresAt <= now)) refuse("FRESH_INDIVIDUAL_LOGIN_REQUIRED");
  if (operation === "REVOKE" && (proof.oldSessionDenied !== true || proof.freshLoginDenied !== true || !Number.isInteger(proof.revokedBefore) || proof.revokedBefore < r.requestedAt || proof.revokedBefore > proof.observedAt)) refuse("INDIVIDUAL_SESSION_DENIAL_REQUIRED");
  return proof;
}
__name(verifySession, "verifySession");
function verifyRuntime(proof, m, now = Math.floor(Date.now() / 1e3)) {
  if (!proof || proof.independentlyVerified !== true || proof.environment !== "TRAINING" || proof.audience !== TRAINING_TARGET.audience || proof.databaseId !== TRAINING_TARGET.databaseId || proof.deploymentId !== TRAINING_TARGET.deploymentId || proof.applicationSha !== m.applicationSha || !/^([a-f0-9]{40})$/.test(m.applicationSha || "") || !Number.isInteger(proof.observedAt) || proof.observedAt > now || proof.observedAt < now - 300) refuse("LIVE_RUNTIME_RECONCILIATION_REQUIRED");
}
__name(verifyRuntime, "verifyRuntime");

// ../../../scripts/lib/training-github-environments.mjs
var TRAINING_REPOSITORY = "VTholdings/creatorloop-main-site";
var TRAINING_BRANCH = "team-access-directory";
var TRAINING_GITHUB_ENVIRONMENTS = Object.freeze({ provider: "creatorloop-training-provider-execution", release: "creatorloop-training-release" });

// ../../../scripts/lib/training-workload-policy.mjs
var WORKLOAD_EXCEPTION_DECISION = "VT-OWNER-2026-10-10-164433-HST";
var WORKLOAD_POLICY_PROTOCOL = "CREATORLOOP_APPROVED_TRAINING_WORKLOAD_POLICY_V2";
var reference = /* @__PURE__ */ __name((v) => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(v), "reference");
var exact = /* @__PURE__ */ __name((v, fields) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join("|") === [...fields].sort().join("|"), "exact");
var isWorkloadPolicy = /* @__PURE__ */ __name((p) => p?.protocol === WORKLOAD_POLICY_PROTOCOL, "isWorkloadPolicy");
function validateWorkloadPolicy(p) {
  if (!exact(p, ["protocol", "environment", "repository", "branch", "account", "reviewerId", "workloadRef", "signerCustodianRef", "exceptionDecisionRef", "ownerOverrideRiskAccepted", "separationControlsRef"]) || p.protocol !== WORKLOAD_POLICY_PROTOCOL || p.environment !== "TRAINING" || p.repository !== "VTholdings/creatorloop-main-site" || p.branch !== "team-access-directory" || !exact(p.account, ["login", "id"]) || !Number.isSafeInteger(p.account.id) || p.account.id <= 0 || typeof p.account.login !== "string" || !/^[-A-Za-z0-9]+\[bot\]$/.test(p.account.login) || !Number.isSafeInteger(p.reviewerId) || p.reviewerId <= 0 || p.reviewerId === p.account.id || !reference(p.workloadRef) || !reference(p.signerCustodianRef) || p.workloadRef === p.signerCustodianRef || p.exceptionDecisionRef !== WORKLOAD_EXCEPTION_DECISION || p.ownerOverrideRiskAccepted !== true || !reference(p.separationControlsRef)) refuse("EXACT_OWNER_APPROVED_TRAINING_WORKLOAD_POLICY_REQUIRED");
  return structuredClone(p);
}
__name(validateWorkloadPolicy, "validateWorkloadPolicy");
function executorAuthorityBinding(policy) {
  return isWorkloadPolicy(policy) ? { workloadRef: policy.workloadRef, exceptionDecisionRef: policy.exceptionDecisionRef } : { humanCustodianRef: policy.humanCustodianRef };
}
__name(executorAuthorityBinding, "executorAuthorityBinding");
function authorityBindingMatches(proof, policy) {
  const binding2 = executorAuthorityBinding(policy);
  return Object.entries(binding2).every(([k, v]) => proof?.[k] === v) && (isWorkloadPolicy(policy) ? !Object.hasOwn(proof || {}, "humanCustodianRef") : !Object.hasOwn(proof || {}, "workloadRef"));
}
__name(authorityBindingMatches, "authorityBindingMatches");
var approvalProtocol = /* @__PURE__ */ __name((p) => isWorkloadPolicy(p) ? "CREATORLOOP_MEDIATED_WORKLOAD_APPROVAL_V2" : "CREATORLOOP_MEDIATED_DISPATCH_APPROVAL_V1", "approvalProtocol");
var auditProtocol = /* @__PURE__ */ __name((p) => isWorkloadPolicy(p) ? "CREATORLOOP_MEDIATED_WORKLOAD_AUDIT_V2" : "CREATORLOOP_MEDIATED_DISPATCH_AUDIT_V1", "auditProtocol");
function auditProjectionFields(p) {
  const authority = p?.protocol === "CREATORLOOP_MEDIATED_WORKLOAD_AUDIT_V2" ? ["workloadRef", "exceptionDecisionRef"] : p?.protocol === "CREATORLOOP_MEDIATED_DISPATCH_AUDIT_V1" ? ["humanCustodianRef"] : null;
  if (!authority) refuse("VERSIONED_SANITIZED_AUDIT_REQUIRED");
  if (p.protocol === "CREATORLOOP_MEDIATED_WORKLOAD_AUDIT_V2" && (!reference(p.workloadRef) || p.exceptionDecisionRef !== WORKLOAD_EXCEPTION_DECISION || p.branch !== "team-access-directory" || typeof p.callerLogin !== "string" || !/^[-A-Za-z0-9]+\[bot\]$/.test(p.callerLogin))) refuse("EXACT_TRAINING_WORKLOAD_AUDIT_REQUIRED");
  return ["protocol", "dispatchId", "decisionRef", "requestHash", "bodyHash", "workflowFile", "branch", "executionSha", "callerLogin", "callerId", ...authority, "claimRef", "observedAt", "outcome", "previousHash", ...Object.hasOwn(p, "runId") ? ["runId"] : []];
}
__name(auditProjectionFields, "auditProjectionFields");

// ../../../scripts/lib/training-mediated-dispatcher.mjs
var TRANSFERRED_EXECUTOR_ACCOUNT = Object.freeze({ login: "kailuatester-del", id: 340701664 });
var DISPATCH_WORKFLOWS = Object.freeze({ provider: "step18-training-provider-workflow.yml", release: "step18-training-release-workflow.yml" });
var hex = /* @__PURE__ */ __name((value, size) => typeof value === "string" && new RegExp(`^[a-f0-9]{${size}}$`).test(value), "hex");
var id = /* @__PURE__ */ __name((value) => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value), "id");
var reference2 = /* @__PURE__ */ __name((value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(value), "reference");
var keys = /* @__PURE__ */ __name((value, expected) => value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).sort().join("|") === [...expected].sort().join("|"), "keys");
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
__name(canonical, "canonical");
var dispatchHash = /* @__PURE__ */ __name((value) => createHash2("sha256").update(canonical(value)).digest("hex"), "dispatchHash");
function validateApprovedExecutorPolicy(policy) {
  if (isWorkloadPolicy(policy)) return validateWorkloadPolicy(policy);
  if (!keys(policy, ["protocol", "account", "reviewerId", "humanCustodianRef", "signerCustodianRef", "separationEvidenceRef"]) || policy.protocol !== "CREATORLOOP_APPROVED_EXECUTOR_POLICY_V1" || !keys(policy.account, ["login", "id"]) || !Number.isSafeInteger(policy.account.id) || policy.account.id <= 0 || typeof policy.account.login !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(policy.account.login) || !Number.isSafeInteger(policy.reviewerId) || policy.reviewerId <= 0 || policy.account.id === policy.reviewerId || !reference2(policy.humanCustodianRef) || !reference2(policy.signerCustodianRef) || policy.humanCustodianRef === policy.signerCustodianRef || !reference2(policy.separationEvidenceRef)) refuse("REVIEWED_INDEPENDENT_EXECUTOR_POLICY_REQUIRED");
  return structuredClone(policy);
}
__name(validateApprovedExecutorPolicy, "validateApprovedExecutorPolicy");
function validateDispatchRequest(request) {
  if (!keys(request, ["dispatchId", "decisionRef", "lane", "executionSha", "inputs"]) || !id(request.dispatchId) || !reference2(request.decisionRef) || !Object.hasOwn(DISPATCH_WORKFLOWS, request.lane) || !hex(request.executionSha, 40)) refuse("EXACT_TRAINING_DISPATCH_REQUEST_REQUIRED");
  const fields = request.lane === "provider" ? ["intended_operation", "owner_decision_ref", "owner_reviewer_id", "approved_port_sha256"] : ["application_sha", "configuration_hash", "owner_decision_ref", "owner_reviewer_id", "approved_port_sha256"];
  if (!keys(request.inputs, fields) || Object.values(request.inputs).some((v) => typeof v !== "string") || request.inputs.owner_decision_ref !== request.decisionRef || !/^[1-9]\d{0,14}$/.test(request.inputs.owner_reviewer_id) || !hex(request.inputs.approved_port_sha256, 64)) refuse("EXACT_APPROVED_WORKFLOW_INPUTS_REQUIRED");
  if (request.lane === "provider" && !["ADMIT", "REVOKE"].includes(request.inputs.intended_operation)) refuse("TRAINING_OPERATION_REFUSED");
  if (request.lane === "release" && (!hex(request.inputs.application_sha, 40) || !hex(request.inputs.configuration_hash, 64))) refuse("EXACT_RELEASE_BINDING_REQUIRED");
  return structuredClone(request);
}
__name(validateDispatchRequest, "validateDispatchRequest");
function approvalValid(approval, request, principal, executorPolicy, now) {
  if (approval?.executorPolicyHash !== dispatchHash(executorPolicy) || !authorityBindingMatches(approval, executorPolicy) || approval.reviewerId !== executorPolicy.reviewerId) refuse("EXECUTOR_CUSTODY_POLICY_NOT_CORROBORATED");
  if (!approval || approval.protocol !== approvalProtocol(executorPolicy) || approval.repository !== TRAINING_REPOSITORY || approval.branch !== TRAINING_BRANCH || approval.workflowFile !== DISPATCH_WORKFLOWS[request.lane] || approval.dispatchId !== request.dispatchId || approval.decisionRef !== request.decisionRef || approval.requestHash !== dispatchHash(request) || approval.executionSha !== request.executionSha || !hex(approval.workflowSha256, 64) || approval.callerId !== principal.id || approval.callerLogin !== principal.login || approval.reviewerId !== Number(request.inputs.owner_reviewer_id) || approval.reviewerId === principal.id || !Number.isInteger(approval.approvedAt) || !Number.isInteger(approval.expiresAt) || approval.approvedAt > now || approval.expiresAt <= now || approval.expiresAt - approval.approvedAt > 300) refuse("CURRENT_EXACT_OWNER_DISPATCH_APPROVAL_REQUIRED");
  return approval;
}
__name(approvalValid, "approvalValid");
function createMediatedDispatcher({ approvedExecutor, authenticateCaller, verifyOwnerDecision, readGithub, dispatchGithub, claimOnce, appendAudit, now = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now") }) {
  for (const port of [authenticateCaller, verifyOwnerDecision, readGithub, dispatchGithub, claimOnce, appendAudit]) if (typeof port !== "function") refuse("PRIVATE_DISPATCHER_PORTS_REQUIRED");
  const executorPolicy = validateApprovedExecutorPolicy(approvedExecutor);
  return async ({ request, callerContext }) => {
    const r = validateDispatchRequest(request);
    let principal;
    try {
      principal = await authenticateCaller(callerContext);
    } catch {
      refuse("DISPATCH_CALLER_AUTHENTICATION_FAILED");
    }
    if (principal?.id !== executorPolicy.account.id || principal?.login !== executorPolicy.account.login || !reference2(principal.authenticationRef) || !Number.isInteger(principal.authenticatedAt) || principal.authenticatedAt > now() || principal.authenticatedAt < now() - 300) refuse("APPOINTED_EXECUTOR_AUTHENTICATION_REQUIRED");
    const decision = /* @__PURE__ */ __name(async () => {
      let value;
      try {
        value = await verifyOwnerDecision({ decisionRef: r.decisionRef, requestHash: dispatchHash(r), callerId: principal.id });
      } catch {
        refuse("OWNER_DISPATCH_DECISION_READ_FAILED");
      }
      return approvalValid(value, r, principal, executorPolicy, now());
    }, "decision");
    const first = structuredClone(await decision());
    const inputs = { ...r.inputs, dispatch_id: r.dispatchId, expected_execution_sha: r.executionSha };
    const endpoint = `/repos/${TRAINING_REPOSITORY}/actions/workflows/${DISPATCH_WORKFLOWS[r.lane]}/dispatches`;
    const body = { ref: TRAINING_BRANCH, inputs };
    const binding2 = { method: "POST", path: endpoint, bodyHash: dispatchHash(body), requestHash: dispatchHash(r), decisionRef: r.decisionRef, dispatchId: r.dispatchId, expiresAt: first.expiresAt };
    const recheck = /* @__PURE__ */ __name(async () => {
      if (principal.authenticatedAt > now() || principal.authenticatedAt < now() - 300) refuse("DISPATCH_CALLER_SESSION_EXPIRED");
      if (dispatchHash(await decision()) !== dispatchHash(first)) refuse("DISPATCH_APPROVAL_CHANGED");
      const root = `/repos/${TRAINING_REPOSITORY}`;
      let ref2, repo, trainingFile, registrationFile;
      try {
        ref2 = await readGithub(root + `/git/ref/heads/${TRAINING_BRANCH}`);
        repo = await readGithub(root);
        if (ref2?.object?.sha !== r.executionSha || repo?.default_branch !== "main") refuse("STALE_DISPATCH_SOURCE_OR_DEFAULT_BRANCH");
        trainingFile = await readGithub(root + `/contents/.github/workflows/${DISPATCH_WORKFLOWS[r.lane]}?ref=${r.executionSha}`);
        registrationFile = await readGithub(root + `/contents/.github/workflows/${DISPATCH_WORKFLOWS[r.lane]}?ref=main`);
      } catch {
        refuse("EXACT_REGISTERED_DISPATCH_SOURCE_NOT_AVAILABLE");
      }
      for (const file of [trainingFile, registrationFile]) {
        if (file?.encoding !== "base64" || typeof file.content !== "string" || file.path !== `.github/workflows/${DISPATCH_WORKFLOWS[r.lane]}`) refuse("REVIEWED_WORKFLOW_CONTENT_REQUIRED");
        const bytes2 = Buffer.from(file.content, "base64");
        if (createHash2("sha256").update(bytes2).digest("hex") !== first.workflowSha256) refuse("REVIEWED_WORKFLOW_HASH_MISMATCH");
      }
    }, "recheck");
    await recheck();
    let reservation;
    try {
      reservation = await claimOnce({ dispatchId: r.dispatchId, decisionRef: r.decisionRef, requestHash: binding2.requestHash });
    } catch {
      refuse("DURABLE_DISPATCH_CLAIM_FAILED_NO_RETRY");
    }
    if (!reservation || reservation.dispatchId !== r.dispatchId || reservation.requestHash !== binding2.requestHash || !reference2(reservation.claimRef)) refuse("DURABLE_ONE_TIME_DISPATCH_CLAIM_REQUIRED");
    let previousHash = null;
    const audit = /* @__PURE__ */ __name(async (outcome, extra = {}) => {
      const record = { protocol: auditProtocol(executorPolicy), dispatchId: r.dispatchId, decisionRef: r.decisionRef, requestHash: binding2.requestHash, bodyHash: binding2.bodyHash, workflowFile: DISPATCH_WORKFLOWS[r.lane], branch: TRAINING_BRANCH, executionSha: r.executionSha, callerLogin: principal.login, callerId: principal.id, ...executorAuthorityBinding(executorPolicy), claimRef: reservation.claimRef, observedAt: now(), outcome, previousHash, ...extra };
      const recordHash = dispatchHash(record);
      let ack;
      try {
        ack = await appendAudit({ ...record, recordHash });
      } catch {
        refuse("DURABLE_DISPATCH_AUDIT_FAILED_NO_RETRY");
      }
      if (ack?.recordHash !== recordHash || !reference2(ack.auditRef)) refuse("DURABLE_DISPATCH_AUDIT_ACK_REQUIRED_NO_RETRY");
      previousHash = recordHash;
    }, "audit");
    await audit("PREPARED");
    try {
      await recheck();
    } catch {
      await audit("REFUSED_BEFORE_SEND");
      refuse("DISPATCH_RECONCILIATION_CHANGED_NO_RETRY");
    }
    await audit("SEND_INTENT");
    let response;
    try {
      response = await dispatchGithub({ ...binding2, body: structuredClone(body), redirect: "error" });
    } catch {
      await audit("OUTCOME_UNKNOWN_NO_RETRY");
      refuse("DISPATCH_OUTCOME_UNKNOWN_NO_RETRY");
    }
    if (response?.status === 200 && Number.isSafeInteger(response.runId) && response.runId > 0) {
      await audit("ACCEPTED_PENDING_RUN_VERIFICATION", { runId: response.runId });
      return { dispatchId: r.dispatchId, runId: response.runId, dispatchAccepted: true, runVerified: false, protectedExecutionAccepted: false };
    }
    if (response?.status === 204) {
      await audit("ACCEPTED_PENDING_RUN_CORRELATION");
      return { dispatchId: r.dispatchId, dispatchAccepted: true, runVerified: false, protectedExecutionAccepted: false };
    }
    await audit("REJECTED_OR_UNKNOWN_NO_RETRY");
    refuse("DISPATCH_REJECTED_OR_UNKNOWN_NO_RETRY");
  };
}
__name(createMediatedDispatcher, "createMediatedDispatcher");

// ../../../workers/training-managed/workload-controls.mjs
var WORKLOAD_RESOURCES = ["creatorloop-training-execution-gateway", "creatorloop-training-execution-capability"];
function validateWorkloadControls(plan, policy) {
  validateWorkloadPolicy(policy);
  if (plan?.protocol !== "CREATORLOOP_TRAINING_WORKLOAD_CONTROLS_V1" || plan.environment !== "TRAINING" || plan.accountId !== "2a3b96a0b37850cd03107131baa66b6d" || !Array.isArray(plan.workers) || [...plan.workers].sort().join("|") !== [...WORKLOAD_RESOURCES].sort().join("|") || plan.repository !== "VTholdings/creatorloop-main-site" || plan.branch !== "team-access-directory" || plan.releaseEnvironment !== "creatorloop-training-release" || plan.preventSelfReview !== true || plan.allowAdminBypass !== false || plan.ownerReviewerId !== policy.reviewerId || plan.deploymentCredentialScope !== "selected-workers-editor" || plan.runtimeManagementCredentials !== false || plan.runtimeApprovalSigningCredentials !== false || plan.automaticCloudflareBuilds !== false || plan.alternateDeploymentCredentials !== false || plan.capabilityPublicRoute !== false || plan.ownerOverrideRiskAccepted !== true || plan.freezePrivilegedChangesWhenCommissioningExpires !== true || typeof plan.expectedSourceSha !== "string" || !/^[a-f0-9]{40}$/.test(plan.expectedSourceSha) || ["ownerOverrideAuditRef", "configVersionReconciliationRef", "vtRecoveryCopyRef", "approvalEvidenceCustodyRef"].some((k) => typeof plan[k] !== "string" || !plan[k].trim())) refuse("EXACT_TRAINING_OVERRIDE_MITIGATION_PLAN_REQUIRED");
  return { planValid: true, effectiveCloudflareControlsVerified: false, protectedExecutionAuthorized: false };
}
__name(validateWorkloadControls, "validateWorkloadControls");
function refuseRuntimeManagementBindings(env2, c) {
  if (!isWorkloadPolicy(c.approvedExecutor)) return;
  const forbidden = /(CLOUDFLARE.*(?:TOKEN|KEY)|DEPLOY.*(?:TOKEN|KEY)|WRANGLER.*(?:TOKEN|KEY)|EVIDENCE.*PRIVATE.*KEY|APPROVAL.*PRIVATE.*KEY|ADMISSION.*PRIVATE.*KEY)/i;
  if (Object.keys(env2).some((k) => forbidden.test(k))) refuse("RUNTIME_MANAGEMENT_OR_SIGNING_BINDING_REFUSED");
}
__name(refuseRuntimeManagementBindings, "refuseRuntimeManagementBindings");

// ../../../workers/training-managed/security.mjs
var bytes = /* @__PURE__ */ __name((s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0)), "bytes");
var b64 = /* @__PURE__ */ __name((buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"), "b64");
var enc = new TextEncoder();
var exact2 = /* @__PURE__ */ __name((value, names) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...names].sort().join("|"), "exact");
function noRedirectFetch(fetchImpl) {
  return async (input, options = {}) => {
    const response = await fetchImpl(input, { ...options, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) refuse("MANAGED_REDIRECT_REFUSED");
    return response;
  };
}
__name(noRedirectFetch, "noRedirectFetch");
async function boundedJson(response, max = 65536) {
  if (!response.ok) refuse("MANAGED_REMOTE_READ_REFUSED");
  const reader = response.body?.getReader();
  if (!reader) refuse("MANAGED_BODY_REQUIRED");
  let size = 0, text = "";
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > max) {
      await reader.cancel();
      refuse("MANAGED_BODY_TOO_LARGE");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}
__name(boundedJson, "boundedJson");
function configuration(env2) {
  const c = JSON.parse(env2.MANAGED_CONFIG_JSON || "null");
  if (!["CREATORLOOP_MANAGED_TRAINING_V1", "CREATORLOOP_MANAGED_TRAINING_V2"].includes(c?.protocol) || c.environment !== "TRAINING" || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(c.accessIssuer || "") || typeof c.accessAudience !== "string" || !c.accessAudience || !Array.isArray(c.identities) || c.identities.length !== 2 || !Number.isSafeInteger(c.appId) || c.appId <= 0 || !Number.isSafeInteger(c.installationId) || c.installationId <= 0 || !Number.isSafeInteger(c.repositoryId) || c.repositoryId <= 0 || !Number.isSafeInteger(c.ownerId) || c.ownerId <= 0 || !Number.isSafeInteger(c.appBotId) || c.appBotId <= 0 || typeof c.appBotLogin !== "string" || !c.appBotLogin.endsWith("[bot]") || typeof c.gatewayOrigin !== "string" || new URL(c.gatewayOrigin).origin !== c.gatewayOrigin || !c.gatewayOrigin.startsWith("https://")) refuse("EXACT_MANAGED_COMMISSIONING_CONFIG_REQUIRED");
  validateApprovedExecutorPolicy(c.approvedExecutor);
  if (c.protocol === "CREATORLOOP_MANAGED_TRAINING_V2") {
    validateWorkloadControls(c.workloadControls, c.approvedExecutor);
    const owner = c.identities.find((i) => i.role === "owner"), service = c.identities.find((i) => i.role === "executor");
    if (!isWorkloadPolicy(c.approvedExecutor) || c.approvedExecutor.account.id !== c.appBotId || c.approvedExecutor.account.login !== c.appBotLogin || !exact2(owner, ["role", "subject", "email", "githubId"]) || typeof owner.subject !== "string" || !owner.subject || typeof owner.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.email) || owner.email !== owner.email.toLowerCase() || owner.githubId !== c.approvedExecutor.reviewerId || !exact2(service, ["role", "type", "clientId", "githubId"]) || service.type !== "access-service-token" || typeof service.clientId !== "string" || !/^[a-f0-9]{32}\.access$/.test(service.clientId) || service.githubId !== c.appBotId || owner.subject === service.clientId) refuse("EXACT_CONSTRAINED_WORKLOAD_IDENTITY_REQUIRED");
  } else {
    if (isWorkloadPolicy(c.approvedExecutor)) refuse("WORKLOAD_REQUIRES_EXPLICIT_V2_CONFIG");
    if (c.approvedExecutor.account.id !== TRANSFERRED_EXECUTOR_ACCOUNT.id || c.approvedExecutor.account.login !== TRANSFERRED_EXECUTOR_ACCOUNT.login) refuse("EXACT_TRANSFERRED_EXECUTOR_REQUIRED");
    for (const role of ["owner", "executor"]) {
      const identity = c.identities.find((i) => i.role === role);
      if (!identity || typeof identity.subject !== "string" || !identity.subject || typeof identity.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email) || identity.email !== identity.email.toLowerCase() || identity.githubId !== (role === "owner" ? c.approvedExecutor.reviewerId : c.approvedExecutor.account.id)) refuse("ACTUAL_MANAGED_IDENTITY_MAPPING_REQUIRED");
    }
    if (c.identities[0].subject === c.identities[1].subject || c.identities[0].email === c.identities[1].email) refuse("MANAGED_IDENTITY_SEPARATION_REQUIRED");
  }
  if (typeof c.oidcAudience !== "string" || !c.oidcAudience || c.oidcAudience === c.accessAudience) refuse("DEDICATED_JOB_AUDIENCE_REQUIRED");
  return c;
}
__name(configuration, "configuration");
async function keys2(url, fetchImpl) {
  return (await boundedJson(await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(1e4) }))).keys;
}
__name(keys2, "keys");
async function verifyJwt(token, { issuer, audience, jwks, now }) {
  if (typeof token !== "string" || token.length > 16384) refuse("BOUNDED_SIGNED_TOKEN_REQUIRED");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p || !/^[A-Za-z0-9_-]+$/.test(p))) refuse("SIGNED_TOKEN_REQUIRED");
  const header = JSON.parse(new TextDecoder().decode(bytes(parts[0]))), payload = JSON.parse(new TextDecoder().decode(bytes(parts[1])));
  if (header.alg !== "RS256" || typeof header.kid !== "string" || header.jku || header.x5u || header.crit || payload.iss !== issuer || !(Array.isArray(payload.aud) ? payload.aud : [payload.aud]).includes(audience) || !Number.isInteger(payload.exp) || payload.exp <= now || !Number.isInteger(payload.iat) || payload.iat > now || payload.nbf !== void 0 && (!Number.isInteger(payload.nbf) || payload.nbf > now)) refuse("SIGNED_TOKEN_CLAIMS_REFUSED");
  const matches = (jwks || []).filter((k) => k.kid === header.kid);
  if (matches.length !== 1 || matches[0].kty !== "RSA" || ["d", "p", "q", "dp", "dq", "qi", "oth"].some((k) => Object.hasOwn(matches[0], k)) || !matches[0].n || bytes(matches[0].n).length < 256) refuse("EXACT_PUBLIC_VERIFICATION_KEY_REQUIRED");
  const key = await crypto.subtle.importKey("jwk", matches[0], { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bytes(parts[2]), enc.encode(parts[0] + "." + parts[1]))) refuse("SIGNED_TOKEN_SIGNATURE_REFUSED");
  return payload;
}
__name(verifyJwt, "verifyJwt");
async function accessPrincipal(token, c, { fetchImpl = fetch, now = Math.floor(Date.now() / 1e3) } = {}) {
  const payload = await verifyJwt(token, { issuer: c.accessIssuer, audience: c.accessAudience, jwks: await keys2(c.accessIssuer + "/cdn-cgi/access/certs", fetchImpl), now });
  if (isWorkloadPolicy(c.approvedExecutor)) {
    const service = c.identities.find((i) => i.role === "executor"), owner = c.identities.find((i) => i.role === "owner");
    if (payload.type === "app" && payload.sub === "" && !Object.hasOwn(payload, "email") && payload.common_name === service.clientId) return { role: "executor", id: c.approvedExecutor.account.id, login: c.approvedExecutor.account.login, authenticationRef: "access-service:" + dispatchHash({ clientId: payload.common_name, iat: payload.iat }), authenticatedAt: now };
    if (payload.type !== "app" || Object.hasOwn(payload, "common_name") || payload.sub !== owner.subject || payload.email !== owner.email) refuse("EXACT_OWNER_OR_WORKLOAD_TOKEN_REQUIRED");
    return { role: "owner", id: owner.githubId, authenticationRef: "access:" + dispatchHash({ sub: payload.sub, iat: payload.iat }), authenticatedAt: now };
  }
  const match = c.identities.find((i) => i.subject === payload.sub && i.email === payload.email);
  if (!match) refuse("INDIVIDUAL_MANAGED_IDENTITY_REQUIRED");
  return { role: match.role, id: match.githubId, login: match.role === "executor" ? c.approvedExecutor.account.login : void 0, authenticationRef: "access:" + dispatchHash({ sub: payload.sub, iat: payload.iat }), authenticatedAt: now };
}
__name(accessPrincipal, "accessPrincipal");
async function githubJob(token, c, lane, executionSha, { fetchImpl = fetch, now = Math.floor(Date.now() / 1e3) } = {}) {
  if (!Object.hasOwn(DISPATCH_WORKFLOWS, lane)) refuse("EXACT_JOB_LANE_REQUIRED");
  const issuer = "https://token.actions.githubusercontent.com";
  const p = await verifyJwt(token, { issuer, audience: c.oidcAudience, jwks: await keys2(issuer + "/.well-known/jwks", fetchImpl), now });
  const environment = lane === "provider" ? "creatorloop-training-provider-execution" : "creatorloop-training-release";
  const expectedWorkflow = `${TRAINING_REPOSITORY}/.github/workflows/${DISPATCH_WORKFLOWS[lane]}@refs/heads/${TRAINING_BRANCH}`;
  if (p.repository !== TRAINING_REPOSITORY || p.repository_id !== String(c.repositoryId) || p.repository_owner_id !== String(c.ownerId) || p.ref !== `refs/heads/${TRAINING_BRANCH}` || p.sha !== executionSha || p.workflow_sha !== executionSha || p.workflow_ref !== expectedWorkflow || p.event_name !== "workflow_dispatch" || p.run_attempt !== "1" || p.actor_id !== String(c.appBotId) || p.actor !== c.appBotLogin || p.runner_environment !== "github-hosted" || p.environment !== environment || typeof p.jti !== "string" || !p.jti || !/^\d+$/.test(p.run_id || "") || !Number.isSafeInteger(Number(p.run_id)) || Number(p.run_id) <= 0 || !Array.isArray(c.allowedOidcSubjects) || !c.allowedOidcSubjects.includes(p.sub) || p.exp - p.iat > 600) refuse("EXACT_PROTECTED_JOB_IDENTITY_REQUIRED");
  return { runId: p.run_id, jtiHash: dispatchHash(p.jti), expiresAt: p.exp, actorId: p.actor_id, lane };
}
__name(githubJob, "githubJob");
async function independentEvidence(c, purpose, query, { fetchImpl = fetch, now = Math.floor(Date.now() / 1e3), identityToken, identityType } = {}) {
  const port = c.evidencePorts?.[purpose];
  if (!port || typeof port.url !== "string" || !port.url.startsWith("https://") || new URL(port.url).username || new URL(port.url).password || !Array.isArray(port.publicKeys) || !port.publicKeys.length || typeof port.issuer !== "string" || !port.issuer) refuse("ACTUAL_INDEPENDENT_EVIDENCE_PORT_REQUIRED");
  if (isWorkloadPolicy(c.approvedExecutor) && (port.administrationRef !== c.workloadControls.approvalEvidenceCustodyRef || new URL(port.url).origin === c.gatewayOrigin || port.administrationRef === c.approvedExecutor.workloadRef)) refuse("OWNER_SEPARATE_EVIDENCE_AUTHORITY_REQUIRED");
  const sensitive = !["commissioning", "runApproval", "runtime"].includes(purpose);
  if (sensitive && (typeof identityToken !== "string" || !identityToken || !["access", "oidc"].includes(identityType))) refuse("AUTHENTICATED_INDEPENDENT_READ_REQUIRED");
  const nonce = crypto.randomUUID(), queryHash = dispatchHash(query);
  const response = await fetchImpl(port.url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(1e4), headers: { "Content-Type": "application/json", ...identityToken ? identityType === "access" ? { "Cf-Access-Jwt-Assertion": identityToken } : { Authorization: "Bearer " + identityToken } : {} }, body: JSON.stringify({ protocol: "CREATORLOOP_INDEPENDENT_READ_V1", purpose, query, queryHash, nonce }) });
  const envelope = await boundedJson(response);
  const p = await verifyJwt(envelope?.jws, { issuer: port.issuer, audience: "CREATORLOOP_TRAINING_EVIDENCE", jwks: port.publicKeys, now });
  if (p.purpose !== purpose || p.nonce !== nonce || p.queryHash !== queryHash || p.exp - p.iat > 300 || p.iat < now - 300 || !Object.hasOwn(p, "value")) refuse("FRESH_BOUND_INDEPENDENT_EVIDENCE_REQUIRED");
  return p.value;
}
__name(independentEvidence, "independentEvidence");

// ../../../workers/training-managed/app-capability.mjs
var encoder = new TextEncoder();
async function installationCapability(env2, c, { fetchImpl = fetch, now = Math.floor(Date.now() / 1e3) } = {}) {
  const pem = env2.GITHUB_APP_PRIVATE_KEY;
  if (typeof pem !== "string" || !pem.startsWith("-----BEGIN PRIVATE KEY-----")) refuse("PRIVATELY_PROVISIONED_APP_KEY_REQUIRED");
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const header = b64(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))), payload = b64(encoder.encode(JSON.stringify({ iat: now - 30, exp: now + 300, iss: String(c.appId) })));
  const unsigned = header + "." + payload, signature = b64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned)));
  const result = await boundedJson(await fetchImpl(`https://api.github.com/app/installations/${c.installationId}/access_tokens`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(1e4), headers: { Authorization: "Bearer " + unsigned + "." + signature, Accept: "application/vnd.github+json", "Content-Type": "application/json" }, body: JSON.stringify({ repository_ids: [c.repositoryId], permissions: { actions: "write" } }) }));
  const permissions = result.permissions, expiry = Math.floor(Date.parse(result.expires_at) / 1e3);
  if (typeof result.token !== "string" || !result.token || !permissions || Object.keys(permissions).sort().join("|") !== "actions|metadata" || permissions.actions !== "write" || permissions.metadata !== "read" || !Number.isInteger(expiry) || expiry <= now || expiry > now + 3600) refuse("ACTUAL_APP_CAPABILITY_SCOPE_REFUSED");
  const repositories = await boundedJson(await fetchImpl("https://api.github.com/installation/repositories?per_page=100", { redirect: "error", signal: AbortSignal.timeout(1e4), headers: { Authorization: "Bearer " + result.token, Accept: "application/vnd.github+json" } }));
  if (repositories.total_count !== 1 || repositories.repositories?.length !== 1 || repositories.repositories[0].id !== c.repositoryId || repositories.repositories[0].full_name !== TRAINING_REPOSITORY) refuse("ACTUAL_APP_REPOSITORY_SELECTION_REFUSED");
  return { kind: "github-app-installation", appId: c.appId, installationId: c.installationId, repositories: [TRAINING_REPOSITORY], permissions, effectiveScopeVerified: true, expiresAt: expiry, token: result.token };
}
__name(installationCapability, "installationCapability");

// ../../../workers/training-managed/commissioning.mjs
async function verifyManagedCommissioning(env2, c, { fetchImpl = fetch, now = Math.floor(Date.now() / 1e3) } = {}) {
  const version2 = env2.WORKER_VERSION_METADATA?.id;
  if (typeof version2 !== "string" || !version2) refuse("EXACT_COMMISSIONED_WORKER_VERSION_REQUIRED");
  const proof = await independentEvidence(c, "commissioning", { configHash: dispatchHash(c), capabilityVersionId: version2, appId: c.appId, installationId: c.installationId, executorPolicyHash: dispatchHash(c.approvedExecutor) }, { fetchImpl, now });
  if (isWorkloadPolicy(c.approvedExecutor)) {
    if (proof?.workloadControlsHash !== dispatchHash(c.workloadControls) || proof.sourceSha !== c.workloadControls.expectedSourceSha || proof.ownerOverrideAuditRef !== c.workloadControls.ownerOverrideAuditRef || proof.controlsEvidenceRef !== c.approvedExecutor.separationControlsRef) refuse("BOUND_WORKLOAD_CONTROL_REFERENCES_REQUIRED");
    if (proof?.configHash !== dispatchHash(c) || proof.capabilityVersionId !== version2 || proof.executorPolicyHash !== dispatchHash(c.approvedExecutor) || proof.protocol !== "CREATORLOOP_TRAINING_WORKLOAD_COMMISSIONING_V2" || proof.exceptionDecisionRef !== WORKLOAD_EXCEPTION_DECISION || proof.ownerOverrideRiskAcknowledged !== true || proof.runtimeHasNoDeploymentAuthority !== true || proof.runtimeHasNoApprovalSigningAuthority !== true || proof.protectedDeploymentPathVerified !== true || proof.unapprovedCodeChangeDetectionVerified !== true || proof.directOverrideMitigationVerified !== true || proof.vtIndependentRecoveryVerified !== true || proof.signingCustodyExcluded !== true || proof.appCapabilityScopeVerified !== true || proof.auditRetentionVerified !== true || proof.approvalObserverAdministrationSeparated !== true || typeof proof.controlsEvidenceRef !== "string" || !proof.controlsEvidenceRef || typeof proof.evidenceRef !== "string" || !proof.evidenceRef) refuse("ACTUAL_TRAINING_WORKLOAD_CONTROLS_REQUIRED");
    return proof;
  }
  if (proof?.configHash !== dispatchHash(c) || proof.capabilityVersionId !== version2 || proof.independentDeploymentAuthorityEnforced !== true || proof.signingCustodyExcluded !== true || proof.appCapabilityScopeVerified !== true || proof.auditRetentionVerified !== true || proof.approvalObserverAdministrationSeparated !== true || proof.executorPolicyHash !== dispatchHash(c.approvedExecutor) || typeof proof.evidenceRef !== "string" || !proof.evidenceRef) refuse("ACTUAL_MANAGED_AUTHORITY_SEPARATION_REQUIRED");
  return proof;
}
__name(verifyManagedCommissioning, "verifyManagedCommissioning");

// ../../../workers/training-managed/custody-export.mjs
var CUSTODY_BODY_LIMIT = 32 * 1024 * 1024;
async function authorizeCustodyExport({ request, body, env: env2, config: config2, fetchImpl, now }) {
  if (!exact2(body, ["protocol", "exportId", "decisionRef", "expectedVersionId"]) || body.protocol !== "CREATORLOOP_OWNER_CUSTODY_EXPORT_V1" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(body.exportId || "") || typeof body.decisionRef !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(body.decisionRef) || typeof body.expectedVersionId !== "string" || !body.expectedVersionId || env2.WORKER_VERSION_METADATA?.id !== body.expectedVersionId) refuse("EXACT_OWNER_EXPORT_VERSION_REQUEST_REQUIRED");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  const principal = await accessPrincipal(token, config2, { fetchImpl, now });
  if (principal.role !== "owner") refuse("OWNER_ONLY_CUSTODY_EXPORT");
  const query = { requestHash: dispatchHash(body), ownerId: principal.id, versionId: body.expectedVersionId, configHash: dispatchHash(config2) };
  const proof = await independentEvidence(config2, "custodyExport", query, { fetchImpl, now, identityToken: token, identityType: "access" });
  if (!exact2(proof, ["protocol", "requestHash", "ownerId", "versionId", "configHash", "decisionRef", "exportId", "dataExportAuthorized", "approvedAt", "expiresAt"]) || proof.protocol !== "CREATORLOOP_OWNER_CUSTODY_EXPORT_APPROVAL_V1" || proof.requestHash !== query.requestHash || proof.ownerId !== principal.id || proof.versionId !== query.versionId || proof.configHash !== query.configHash || proof.decisionRef !== body.decisionRef || proof.exportId !== body.exportId || proof.dataExportAuthorized !== true || !Number.isInteger(proof.approvedAt) || !Number.isInteger(proof.expiresAt) || proof.approvedAt > now || proof.approvedAt < now - 300 || proof.expiresAt <= now || proof.expiresAt - proof.approvedAt > 300) refuse("CURRENT_INDEPENDENT_OWNER_EXPORT_APPROVAL_REQUIRED");
  return { ownerId: principal.id, versionId: query.versionId, configHash: query.configHash, requestHash: query.requestHash, approvalHash: dispatchHash(proof), expiresAt: proof.expiresAt };
}
__name(authorizeCustodyExport, "authorizeCustodyExport");

// ../../../scripts/lib/training-github-dispatch-transport.mjs
function createGithubDispatchTransport({ verifyDispatchAuthorization, resolveAppCapability, fetchImpl, now = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now") }) {
  for (const port of [verifyDispatchAuthorization, resolveAppCapability, fetchImpl]) if (typeof port !== "function") refuse("PRIVATE_GITHUB_APP_TRANSPORT_PORTS_REQUIRED");
  return async (call) => {
    const lane = Object.keys(DISPATCH_WORKFLOWS).find((k) => call?.path === `/repos/${TRAINING_REPOSITORY}/actions/workflows/${DISPATCH_WORKFLOWS[k]}/dispatches`);
    if (!lane || call.method !== "POST" || call.redirect !== "error" || !call.body || Object.keys(call.body).sort().join("|") !== "inputs|ref" || call.body.ref !== TRAINING_BRANCH) refuse("EXACT_GITHUB_DISPATCH_ENDPOINT_REQUIRED");
    const { dispatch_id, expected_execution_sha, ...inputs } = call.body.inputs || {};
    const request = validateDispatchRequest({ dispatchId: dispatch_id, decisionRef: call.decisionRef, lane, executionSha: expected_execution_sha, inputs });
    if (call.dispatchId !== request.dispatchId || call.requestHash !== dispatchHash(request) || call.bodyHash !== dispatchHash(call.body) || !Number.isInteger(call.expiresAt) || call.expiresAt <= now() || call.expiresAt > now() + 300) refuse("EXACT_GITHUB_DISPATCH_BINDING_REQUIRED");
    let authority;
    try {
      authority = await verifyDispatchAuthorization({ dispatchId: call.dispatchId, requestHash: call.requestHash, bodyHash: call.bodyHash, method: "POST", path: call.path });
    } catch {
      refuse("PRIVATE_DISPATCH_AUTHORIZATION_FAILED");
    }
    if (authority?.requestHash !== call.requestHash || authority.bodyHash !== call.bodyHash || authority.decisionRef !== call.decisionRef || authority.expiresAt !== call.expiresAt || typeof authority.capabilityRef !== "string" || !authority.capabilityRef) refuse("CURRENT_PRIVATE_DISPATCH_AUTHORIZATION_REQUIRED");
    let capability;
    try {
      capability = await resolveAppCapability(authority.capabilityRef);
    } catch {
      refuse("PRIVATE_GITHUB_APP_CAPABILITY_UNAVAILABLE");
    }
    if (capability?.kind !== "github-app-installation" || !Number.isSafeInteger(capability.appId) || capability.appId <= 0 || !Number.isSafeInteger(capability.installationId) || capability.installationId <= 0 || authority.appId !== capability.appId || authority.installationId !== capability.installationId || capability.repositories?.length !== 1 || capability.repositories[0] !== TRAINING_REPOSITORY || Object.keys(capability.permissions || {}).sort().join("|") !== "actions|metadata" || capability.permissions.actions !== "write" || capability.permissions.metadata !== "read" || capability.effectiveScopeVerified !== true || !Number.isInteger(capability.expiresAt) || capability.expiresAt <= now() || capability.expiresAt > now() + 3600 || typeof capability.token !== "string" || !capability.token) refuse("EXACT_REPOSITORY_ACTIONS_ONLY_CAPABILITY_REQUIRED");
    if (call.expiresAt <= now() || capability.expiresAt <= now()) refuse("DISPATCH_AUTHORITY_EXPIRED_BEFORE_SEND");
    let response;
    try {
      response = await fetchImpl("https://api.github.com" + call.path, { method: "POST", redirect: "error", signal: AbortSignal.timeout(1e4), headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: "Bearer " + capability.token }, body: JSON.stringify(call.body) });
    } catch {
      refuse("GITHUB_DISPATCH_TRANSPORT_OUTCOME_UNKNOWN_NO_RETRY");
    }
    if (response.status === 204) return { status: 204 };
    if (response.status !== 200) return { status: response.status };
    let raw;
    try {
      const reader = response.body?.getReader();
      if (!reader) refuse("GITHUB_RESPONSE_BODY_REQUIRED");
      let size = 0, parts = [];
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 16384) {
          await reader.cancel();
          refuse("GITHUB_RESPONSE_TOO_LARGE");
        }
        parts.push(Buffer.from(chunk.value));
      }
      raw = JSON.parse(Buffer.concat(parts).toString("utf8"));
    } catch {
      refuse("GITHUB_DISPATCH_RESPONSE_UNKNOWN_NO_RETRY");
    }
    if (!Number.isSafeInteger(raw.workflow_run_id) || raw.workflow_run_id <= 0) refuse("GITHUB_DISPATCH_RUN_ID_NOT_CORROBORATED");
    return { status: 200, runId: raw.workflow_run_id };
  };
}
__name(createGithubDispatchTransport, "createGithubDispatchTransport");

// ../../../scripts/lib/creatorloop-training-provider.mjs
function createTrainingProvider({ manifest, transport, readCurrentRequest, verifyApproval, observeSession, observeRuntime, now = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now") }) {
  for (const port of [transport, readCurrentRequest, verifyApproval, observeSession, observeRuntime]) if (typeof port !== "function") refuse("EXTERNAL_PROVIDER_PORTS_REQUIRED");
  const m = structuredClone(manifest);
  validateManifest(m, now());
  const policyRoot = `/accounts/${TRAINING_TARGET.accountId}/access/apps/${TRAINING_TARGET.appId}/policies`;
  let ownedPolicyId = m.ownedPolicyId || null, mutationAttempted = false;
  const guard = /* @__PURE__ */ __name((r) => fence(r, m, { readCurrentRequest, verifyApproval, now }), "guard");
  const call = /* @__PURE__ */ __name(async (method, path, body) => {
    let result;
    try {
      result = await transport({ method, path, ...body ? { body: structuredClone(body) } : {}, redirect: "error" });
    } catch {
      refuse(method === "GET" ? "PROVIDER_READ_FAILED" : "PROVIDER_MUTATION_OUTCOME_UNKNOWN_NO_RETRY");
    }
    if (!result || result.success !== true) refuse(method === "GET" ? "PROVIDER_READ_REFUSED" : "PROVIDER_MUTATION_REFUSED_NO_RETRY");
    return result;
  }, "call");
  const policies = /* @__PURE__ */ __name(async () => {
    const out = [];
    for (let page = 1; page <= 20; page++) {
      const result = await call("GET", policyRoot + `?page=${page}&per_page=50`);
      if (!Array.isArray(result.result)) refuse("POLICY_LIST_INVALID");
      out.push(...result.result);
      const pages = result.result_info?.total_pages;
      if (pages !== void 0 ? Number.isInteger(pages) && pages >= 1 && page >= pages : result.result.length < 50) return out;
    }
    refuse("POLICY_LIST_INCOMPLETE");
  }, "policies");
  const inspect = /* @__PURE__ */ __name(async (r) => {
    await guard(r);
    const list = await policies();
    if (preservedHash(list, m) !== m.preservedPoliciesHash) refuse("OWNER_SERVICE_POLICIES_CHANGED");
    const matches = list.filter((p) => ownPolicy(p, m));
    if (matches.length > 1 || list.some((p) => p.name === policyTemplate(m).name && !ownPolicy(p, m))) refuse("DEDICATED_POLICY_COLLISION");
    if (matches[0] && !/^[a-f0-9-]{36}$/.test(matches[0].id || "")) refuse("POLICY_ID_INVALID");
    if (ownedPolicyId && matches[0] && matches[0].id !== ownedPolicyId) refuse("POLICY_OWNERSHIP_MISMATCH");
    return { list, policy: matches[0] };
  }, "inspect");
  return {
    async currentRequest(operatorId) {
      if (operatorId !== m.subject.operatorId) refuse("SUBJECT_LOOKUP_REFUSED");
      const current = await readCurrentRequest(operatorId);
      validateRequest(current?.request, m, now());
      if (current.personnelVersion !== m.requestVersion) refuse("PERSONNEL_VERSION_CHANGED");
      await guard(current.request);
      return current.request;
    },
    async ensureApprovedIndividualAdmission(r) {
      validateRequest(r, m, now());
      if (r.operation !== "ADMIT") refuse("ADMIT_OPERATION_REFUSED");
      const before = await inspect(r);
      verifyRuntime(await observeRuntime(), m, now());
      if (before.policy) {
        ownedPolicyId = before.policy.id;
        return;
      }
      if (mutationAttempted) refuse("MUTATION_REPLAY_REFUSED");
      await guard(r);
      mutationAttempted = true;
      const created = await call("POST", policyRoot, policyTemplate(m));
      if (!ownPolicy(created.result, m) || !/^[a-f0-9-]{36}$/.test(created.result?.id || "")) refuse("CREATED_POLICY_UNVERIFIED_NO_RETRY");
      ownedPolicyId = created.result.id;
      const after = await inspect(r);
      if (after.policy?.id !== ownedPolicyId) refuse("ADMISSION_POLICY_NOT_CORROBORATED");
    },
    async revokeIndividualAdmissionAndSessions(r) {
      validateRequest(r, m, now());
      if (r.operation !== "REVOKE") refuse("REVOKE_OPERATION_REFUSED");
      const before = await inspect(r);
      verifyRuntime(await observeRuntime(), m, now());
      if (mutationAttempted) refuse("MUTATION_REPLAY_REFUSED");
      await guard(r);
      mutationAttempted = true;
      if (before.policy) {
        if (before.policy.id !== m.ownedPolicyId) refuse("REVOKE_POLICY_NOT_OWNED");
        await call("DELETE", policyRoot + "/" + m.ownedPolicyId);
      }
      const removed = await inspect(r);
      if (removed.policy) refuse("POLICY_REMOVAL_NOT_CORROBORATED");
      await guard(r);
      await call("POST", `/accounts/${TRAINING_TARGET.accountId}/access/organizations/revoke_user`, { email: m.subject.email, user_uid: m.subject.subject, devices: false, warp_session_reauth: false });
    },
    async verifyIndividualState(r) {
      const observed = await inspect(r);
      const runtime = await observeRuntime();
      verifyRuntime(runtime, m, now());
      const session = verifySession(await observeSession(structuredClone(r)), r, m, now());
      if (r.operation === "ADMIT" && !observed.policy) refuse("ADMISSION_POLICY_MISSING");
      if (r.operation === "REVOKE" && observed.policy) refuse("REVOCATION_POLICY_PRESENT");
      await guard(r);
      return { email: m.subject.email, subject: m.subject.subject, environment: "TRAINING", audience: TRAINING_TARGET.audience, databaseId: TRAINING_TARGET.databaseId, deploymentId: TRAINING_TARGET.deploymentId, operation: r.operation, policyId: ownedPolicyId || m.ownedPolicyId, policyVerified: true, sessionVerified: true, ownerPolicyUnchanged: true, servicePoliciesUnchanged: true, ...r.operation === "REVOKE" ? { revokedBefore: session.revokedBefore } : {} };
    }
  };
}
__name(createTrainingProvider, "createTrainingProvider");

// ../../../scripts/lib/creatorloop-training-transport.mjs
function createTrainingTransport({ fetcher, resolveShortLivedCapability, verifyHostAuthorization, now = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now") }) {
  for (const port of [fetcher, resolveShortLivedCapability, verifyHostAuthorization]) if (typeof port !== "function") refuse("PRIVATE_TRANSPORT_PORTS_REQUIRED");
  const root = `/accounts/${TRAINING_TARGET.accountId}`, policy = root + `/access/apps/${TRAINING_TARGET.appId}/policies`;
  return async ({ method, path, body, redirect }) => {
    const list = method === "GET" && path.startsWith(policy + "?") && /^\?page=([1-9]|1[0-9]|20)&per_page=50$/.test(path.slice(policy.length));
    const create = method === "POST" && path === policy;
    const remove = method === "DELETE" && path.startsWith(policy + "/") && /^[a-f0-9-]{36}$/.test(path.slice(policy.length + 1));
    const revoke = method === "POST" && path === root + "/access/organizations/revoke_user";
    if (![list, create, remove, revoke].some(Boolean) || redirect !== "error") refuse("TRAINING_TRANSPORT_ENDPOINT_REFUSED");
    const authorization = await verifyHostAuthorization({ method, path, body });
    if (!authorization || authorization.authorized !== true || authorization.requestHash !== sha256({ method, path, ...body ? { body } : {} }) || authorization.environment !== "TRAINING" || authorization.targetAppId !== TRAINING_TARGET.appId || !Number.isInteger(authorization.expiresAt) || authorization.expiresAt <= now() || typeof authorization.credentialRef !== "string" || !authorization.credentialRef) refuse("PRIVATE_HOST_AUTHORITY_MISSING");
    let capability = await resolveShortLivedCapability(authorization.credentialRef);
    if (!capability || typeof capability.token !== "string" || !capability.token || capability.accountId !== TRAINING_TARGET.accountId || !Number.isInteger(capability.expiresAt) || capability.expiresAt <= now() || capability.expiresAt > now() + 3600 || capability.permissionAcceptanceVerified !== true) refuse("SHORT_LIVED_CAPABILITY_NOT_VERIFIED");
    try {
      const response = await fetcher("https://api.cloudflare.com/client/v4" + path, { method, redirect: "error", signal: AbortSignal.timeout(1e4), headers: { Authorization: "Bearer " + capability.token, ...body ? { "Content-Type": "application/json" } : {} }, ...body ? { body: JSON.stringify(body) } : {} });
      if (response.status >= 300 || response.status < 200) return { success: false, status: response.status };
      if (Number(response.headers.get("content-length") || 0) > 1048576) refuse("PROVIDER_RESPONSE_TOO_LARGE");
      const reader = response.body?.getReader();
      if (!reader) refuse("PROVIDER_RESPONSE_INVALID");
      let text = "", bytes2 = 0;
      const decoder = new TextDecoder();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes2 += chunk.value.length;
        if (bytes2 > 1048576) {
          await reader.cancel();
          refuse("PROVIDER_RESPONSE_TOO_LARGE");
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      const parsed = JSON.parse(text);
      if (parsed.success !== true) return { success: false, status: response.status };
      return { success: true, status: response.status, result: parsed.result, ...parsed.result_info ? { result_info: { total_pages: parsed.result_info.total_pages, total_count: parsed.result_info.total_count } } : {} };
    } catch {
      refuse(method === "GET" ? "PRIVATE_PROVIDER_READ_FAILED" : "PRIVATE_PROVIDER_MUTATION_OUTCOME_UNKNOWN");
    } finally {
      capability = null;
    }
  };
}
__name(createTrainingTransport, "createTrainingTransport");

// ../../../workers/training-managed/capability-core.mjs
var json = /* @__PURE__ */ __name((body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }), "json");
function createCapability({ fetchImpl = fetch, now = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now") } = {}) {
  fetchImpl = noRedirectFetch(fetchImpl);
  return { async fetch(request, env2) {
    try {
      const c = configuration(env2), url = new URL(request.url);
      refuseRuntimeManagementBindings(env2, c);
      if (request.method !== "POST" || url.search || !["/v1/approve", "/v1/dispatch", "/v1/run-check", "/v1/provider", "/v1/custody/export"].includes(url.pathname)) return json({ error: "Private route refused" }, 404);
      const body = await boundedJson(new Response(request.body, { status: 200 }), 32768);
      if (url.pathname === "/v1/custody/export") {
        const authority = await authorizeCustodyExport({ request, body, env: env2, config: c, fetchImpl, now: now() });
        if (!env2.STATE?.idFromName || !env2.STATE?.get) refuse("CUSTODY_STATE_NOT_PROVISIONED");
        const state2 = env2.STATE.get(env2.STATE.idFromName("creatorloop-training-execution-v1"));
        const result = await state2.exportCustody({ request: body, authority });
        if (authority.expiresAt <= now()) refuse("CUSTODY_EXPORT_AUTHORIZATION_EXPIRED");
        return json(result);
      }
      await verifyManagedCommissioning(env2, c, { fetchImpl, now: now() });
      if (!env2.STATE?.idFromName || !env2.STATE?.get) refuse("MANAGED_STATE_NOT_COMMISSIONED");
      const state = env2.STATE.get(env2.STATE.idFromName("creatorloop-training-execution-v1"));
      const human = ["/v1/approve", "/v1/dispatch"].includes(url.pathname);
      const identityToken = human ? request.headers.get("Cf-Access-Jwt-Assertion") : request.headers.get("Authorization")?.replace(/^Bearer /, "");
      const evidence = /* @__PURE__ */ __name((purpose, query) => independentEvidence(c, purpose, query, { fetchImpl, now: now(), identityToken, identityType: human ? "access" : "oidc" }), "evidence");
      if (url.pathname === "/v1/approve") {
        const principal = await accessPrincipal(request.headers.get("Cf-Access-Jwt-Assertion"), c, { fetchImpl, now: now() });
        if (principal.role !== "owner" || !exact2(body, ["request"])) refuse("OWNER_EXACT_APPROVAL_REQUIRED");
        const r2 = validateDispatchRequest(body.request);
        if (isWorkloadPolicy(c.approvedExecutor) && r2.executionSha !== c.workloadControls.expectedSourceSha) refuse("WORKLOAD_REVIEWED_SOURCE_REQUIRED");
        const approval = await evidence("dispatchApproval", { request: r2, requestHash: dispatchHash(r2), reviewerId: principal.id, executorPolicyHash: dispatchHash(c.approvedExecutor) });
        if (approval?.protocol !== approvalProtocol(c.approvedExecutor) || !authorityBindingMatches(approval, c.approvedExecutor) || approval.reviewerId !== principal.id || approval.requestHash !== dispatchHash(r2) || approval.executorPolicyHash !== dispatchHash(c.approvedExecutor) || approval.dispatchId !== r2.dispatchId || approval.decisionRef !== r2.decisionRef || approval.callerId !== c.approvedExecutor.account.id || approval.callerLogin !== c.approvedExecutor.account.login || !Number.isInteger(approval.approvedAt) || !Number.isInteger(approval.expiresAt) || approval.approvedAt > now() || approval.expiresAt - approval.approvedAt > 300 || approval.expiresAt <= now()) refuse("INDEPENDENT_OWNER_APPROVAL_NOT_CORROBORATED");
        return json(await state.putDecision({ request: r2, approval }));
      }
      if (url.pathname === "/v1/dispatch") {
        const token2 = request.headers.get("Cf-Access-Jwt-Assertion");
        const r2 = validateDispatchRequest(body);
        if (isWorkloadPolicy(c.approvedExecutor) && r2.executionSha !== c.workloadControls.expectedSourceSha) refuse("WORKLOAD_REVIEWED_SOURCE_REQUIRED");
        const stored2 = await state.decision(r2.dispatchId);
        if (dispatchHash(stored2.request) !== dispatchHash(r2)) refuse("IMMUTABLE_DISPATCH_DECISION_MISMATCH");
        const decision = /* @__PURE__ */ __name(async () => {
          const fresh = await evidence("dispatchApproval", { request: r2, requestHash: dispatchHash(r2), reviewerId: stored2.approval.reviewerId, executorPolicyHash: dispatchHash(c.approvedExecutor) });
          if (dispatchHash(fresh) !== dispatchHash(stored2.approval)) refuse("CURRENT_OWNER_DECISION_CHANGED");
          return fresh;
        }, "decision");
        const transport = createGithubDispatchTransport({
          now,
          fetchImpl,
          verifyDispatchAuthorization: /* @__PURE__ */ __name(async (call) => {
            const approved = await decision();
            return { ...call, decisionRef: r2.decisionRef, expiresAt: approved.expiresAt, capabilityRef: "managed-github-app", appId: c.appId, installationId: c.installationId };
          }, "verifyDispatchAuthorization"),
          resolveAppCapability: /* @__PURE__ */ __name(async (ref2) => {
            if (ref2 !== "managed-github-app") refuse("APP_CAPABILITY_REFUSED");
            await verifyManagedCommissioning(env2, c, { fetchImpl, now: now() });
            return installationCapability(env2, c, { fetchImpl, now: now() });
          }, "resolveAppCapability")
        });
        const dispatcher = createMediatedDispatcher({
          approvedExecutor: c.approvedExecutor,
          now,
          authenticateCaller: /* @__PURE__ */ __name(async () => {
            const p = await accessPrincipal(token2, c, { fetchImpl, now: now() });
            if (p.role !== "executor") refuse("EXECUTOR_ROLE_REQUIRED");
            return p;
          }, "authenticateCaller"),
          verifyOwnerDecision: decision,
          readGithub: /* @__PURE__ */ __name(async (path) => boundedJson(await fetchImpl("https://api.github.com" + path, { redirect: "error", signal: AbortSignal.timeout(1e4), headers: { Accept: "application/vnd.github+json" } })), "readGithub"),
          dispatchGithub: transport,
          claimOnce: /* @__PURE__ */ __name((claim) => state.claimOnce(claim), "claimOnce"),
          appendAudit: /* @__PURE__ */ __name((event) => state.appendAudit(event), "appendAudit")
        });
        return json(await dispatcher({ request: r2 }));
      }
      if (!exact2(body, ["dispatchId", "lane", "executionSha"])) refuse("EXACT_JOB_REQUEST_REQUIRED");
      if (isWorkloadPolicy(c.approvedExecutor) && body.executionSha !== c.workloadControls.expectedSourceSha) refuse("WORKLOAD_REVIEWED_SOURCE_REQUIRED");
      const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
      const job = await githubJob(token, c, body.lane, body.executionSha, { fetchImpl, now: now() });
      const stored = await state.decision(body.dispatchId);
      if (stored.request.executionSha !== body.executionSha || stored.request.lane !== body.lane) refuse("JOB_DECISION_SOURCE_MISMATCH");
      const events = await state.retainedEvents(body.dispatchId);
      const accepted = events.find((e) => e.outcome === "ACCEPTED_PENDING_RUN_VERIFICATION" && String(e.runId) === job.runId || e.outcome === "ACCEPTED_PENDING_RUN_CORRELATION");
      if (!accepted) refuse("EXACT_RETAINED_DISPATCH_RUN_REQUIRED");
      const runProof = await evidence("runApproval", { dispatchId: body.dispatchId, runId: job.runId, requestHash: dispatchHash(stored.request), executionSha: body.executionSha, executorPolicyHash: dispatchHash(c.approvedExecutor) });
      if (runProof?.dispatchId !== body.dispatchId || runProof.runId !== job.runId || runProof.executionSha !== body.executionSha || runProof.workflowFile !== DISPATCH_WORKFLOWS[body.lane] || runProof.callerId !== c.approvedExecutor.account.id || runProof.requestHash !== dispatchHash(stored.request) || runProof.executorPolicyHash !== dispatchHash(c.approvedExecutor) || runProof.appBotId !== c.appBotId || !Number.isInteger(runProof.expiresAt) || runProof.expiresAt <= now()) refuse("CURRENT_INDEPENDENT_RUN_APPROVAL_REQUIRED");
      if (isWorkloadPolicy(c.approvedExecutor) && !authorityBindingMatches(runProof, c.approvedExecutor)) refuse("CURRENT_WORKLOAD_RUN_BINDING_REQUIRED");
      if (url.pathname === "/v1/run-check") return json({ dispatchId: body.dispatchId, runId: job.runId, executionSha: body.executionSha, mediatedRunVerified: true, protectedExecutionAccepted: false });
      if (body.lane !== "provider") refuse("PROVIDER_LANE_ONLY");
      const bundle = await evidence("executionBundle", { dispatchId: body.dispatchId, runId: job.runId, requestHash: dispatchHash(stored.request) });
      const m = bundle?.manifest, r = bundle?.request;
      validateManifest(m, now());
      validateRequest(r, m, now());
      if (m.executionSha !== body.executionSha || m.ownerDecisionRef !== stored.request.decisionRef || m.operation !== stored.request.inputs.intended_operation) refuse("EXACT_PROVIDER_RUN_OPERATION_REQUIRED");
      if (isWorkloadPolicy(c.approvedExecutor) && (m.executorPrincipal !== c.approvedExecutor.workloadRef || m.signerPrincipal !== c.approvedExecutor.signerCustodianRef)) refuse("EXACT_WORKLOAD_AND_MAC_PRINCIPALS_REQUIRED");
      await state.claimJob({ key: dispatchHash({ requestId: r.id, requestVersion: r.requestVersion, operation: r.operation }), dispatchId: body.dispatchId, expiresAt: Math.min(job.expiresAt, m.expiresAt) });
      const append = /* @__PURE__ */ __name(async (outcome) => {
        const retained = await state.retainedEvents(body.dispatchId), last = retained.at(-1);
        const record = { ...accepted, runId: Number(job.runId), observedAt: now(), outcome, previousHash: last.recordHash };
        delete record.recordHash;
        return state.appendAudit({ ...record, recordHash: dispatchHash(record) });
      }, "append");
      await append("PROVIDER_SEND_INTENT");
      try {
        const verifyApproval = /* @__PURE__ */ __name(() => evidence("providerApproval", { manifestHash: sha256(m), ownerDecisionRef: m.ownerDecisionRef, executionSha: m.executionSha }), "verifyApproval");
        const readCurrentRequest = /* @__PURE__ */ __name((operatorId) => evidence("currentRequest", { operatorId, requestId: m.requestId }), "readCurrentRequest");
        const transport = createTrainingTransport({
          now,
          fetcher: fetchImpl,
          verifyHostAuthorization: /* @__PURE__ */ __name((call) => evidence("providerCapability", { ...call, requestId: r.id, manifestHash: sha256(m), requestHash: sha256(call) }), "verifyHostAuthorization"),
          resolveShortLivedCapability: /* @__PURE__ */ __name(async (ref2) => {
            await verifyManagedCommissioning(env2, c, { fetchImpl, now: now() });
            const meta = c.providerCapability;
            if (!meta || meta.credentialRef !== ref2 || ref2 !== m.providerCredentialRef || meta.accountId !== TRAINING_TARGET.accountId || !Number.isInteger(meta.expiresAt) || meta.expiresAt <= now() || meta.permissionAcceptanceVerified !== true || typeof env2.TRAINING_PROVIDER_TOKEN !== "string" || !env2.TRAINING_PROVIDER_TOKEN) refuse("ACTUAL_SCOPED_PROVIDER_CAPABILITY_REQUIRED");
            const scope = await evidence("providerScope", { credentialRef: ref2, capabilityHash: dispatchHash(meta), manifestHash: sha256(m) });
            if (scope?.capabilityHash !== dispatchHash(meta) || scope.credentialRef !== ref2 || scope.effectiveScopeVerified !== true || scope.expiresAt !== meta.expiresAt) refuse("INDEPENDENT_PROVIDER_SCOPE_NOT_CORROBORATED");
            return { ...meta, token: env2.TRAINING_PROVIDER_TOKEN };
          }, "resolveShortLivedCapability")
        });
        const provider = createTrainingProvider({ manifest: m, transport, verifyApproval, readCurrentRequest, now, observeRuntime: /* @__PURE__ */ __name(() => evidence("runtime", { applicationSha: m.applicationSha }), "observeRuntime"), observeSession: /* @__PURE__ */ __name((request2) => evidence("session", { requestId: request2.id, operation: request2.operation, subject: m.subject.subject }), "observeSession") });
        if (r.operation === "ADMIT") await provider.ensureApprovedIndividualAdmission(r);
        else await provider.revokeIndividualAdmissionAndSessions(r);
        await provider.verifyIndividualState(r);
        await append("PROVIDER_STATE_OBSERVED_SIGNER_ACCEPTANCE_PENDING");
        return json({ dispatchId: body.dispatchId, runId: job.runId, requestId: r.id, operation: r.operation, providerObserved: true, signerAcceptancePending: true, protectedExecutionAccepted: false });
      } catch {
        await append("PROVIDER_OUTCOME_UNRESOLVED_NO_RETRY");
        refuse("PROVIDER_OPERATION_UNRESOLVED_NO_RETRY");
      }
    } catch {
      return json({ error: "Managed capability refused or outcome unresolved; no automatic retry" }, 403);
    }
  } };
}
__name(createCapability, "createCapability");

// ../../../workers/training-managed/state.mjs
function createManagedState({ sql, transactionSync, bucket, now = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now") }) {
  if (!sql || typeof transactionSync !== "function" || typeof bucket?.put !== "function") refuse("MANAGED_DURABLE_STORAGE_REQUIRED");
  sql.exec(`CREATE TABLE IF NOT EXISTS claims (dispatch_id TEXT PRIMARY KEY, decision_ref TEXT NOT NULL, request_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS decisions (dispatch_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, decision_json TEXT NOT NULL, retained INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, dispatch_id TEXT NOT NULL, record_hash TEXT NOT NULL UNIQUE, record_json TEXT NOT NULL, retained INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS jobs (key TEXT PRIMARY KEY, dispatch_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
 CREATE TRIGGER IF NOT EXISTS claims_no_update BEFORE UPDATE ON claims BEGIN SELECT RAISE(ABORT,'Immutable claim'); END;
 CREATE TRIGGER IF NOT EXISTS claims_no_delete BEFORE DELETE ON claims BEGIN SELECT RAISE(ABORT,'Immutable claim'); END;
 CREATE TRIGGER IF NOT EXISTS jobs_no_update BEFORE UPDATE ON jobs BEGIN SELECT RAISE(ABORT,'Immutable job'); END;
 CREATE TRIGGER IF NOT EXISTS jobs_no_delete BEFORE DELETE ON jobs BEGIN SELECT RAISE(ABORT,'Immutable job'); END;
 CREATE TRIGGER IF NOT EXISTS decisions_no_delete BEFORE DELETE ON decisions BEGIN SELECT RAISE(ABORT,'Immutable decision'); END;
 CREATE TRIGGER IF NOT EXISTS decisions_body_immutable BEFORE UPDATE ON decisions WHEN NEW.dispatch_id!=OLD.dispatch_id OR NEW.request_hash!=OLD.request_hash OR NEW.decision_json!=OLD.decision_json OR NEW.retained<OLD.retained BEGIN SELECT RAISE(ABORT,'Immutable decision'); END;
 CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'Immutable audit'); END;
 CREATE TRIGGER IF NOT EXISTS events_body_immutable BEFORE UPDATE ON events WHEN NEW.sequence!=OLD.sequence OR NEW.dispatch_id!=OLD.dispatch_id OR NEW.record_hash!=OLD.record_hash OR NEW.record_json!=OLD.record_json OR NEW.retained<OLD.retained BEGIN SELECT RAISE(ABORT,'Immutable audit'); END;`);
  const rows = /* @__PURE__ */ __name((query, ...args) => sql.exec(query, ...args).toArray(), "rows");
  return {
    async putDecision({ request, approval }) {
      const requestHash = dispatchHash(request);
      if (approval?.requestHash !== requestHash || approval.dispatchId !== request.dispatchId || approval.expiresAt <= now()) refuse("CURRENT_BOUND_MANAGED_DECISION_REQUIRED");
      transactionSync(() => {
        if (rows("SELECT 1 FROM decisions WHERE dispatch_id=?", request.dispatchId).length) refuse("IMMUTABLE_MANAGED_DECISION_EXISTS");
        sql.exec("INSERT INTO decisions (dispatch_id,request_hash,decision_json) VALUES (?,?,?)", request.dispatchId, requestHash, JSON.stringify({ request, approval }));
      });
      const projection = { protocol: "CREATORLOOP_MANAGED_OWNER_DECISION_AUDIT_V1", dispatchId: request.dispatchId, decisionRef: request.decisionRef, requestHash, approvalHash: dispatchHash(approval), reviewerId: approval.reviewerId, observedAt: now() }, hash = dispatchHash(projection);
      const stored = await bucket.put(`training-decisions/${request.dispatchId}/${hash}.json`, JSON.stringify({ ...projection, recordHash: hash }), { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" }, customMetadata: { sha256: hash } });
      if (!stored) refuse("OWNER_DECISION_AUDIT_NOT_RETAINED");
      transactionSync(() => sql.exec("UPDATE decisions SET retained=1 WHERE dispatch_id=?", request.dispatchId));
      return { dispatchId: request.dispatchId, requestHash, decisionRecorded: true };
    },
    async decision(dispatchId) {
      const row = rows("SELECT decision_json,retained FROM decisions WHERE dispatch_id=?", dispatchId)[0];
      if (!row || row.retained !== 1) refuse("MANAGED_RETAINED_DECISION_NOT_FOUND");
      return JSON.parse(row.decision_json);
    },
    async claimOnce(claim) {
      return transactionSync(() => {
        if (!claim || typeof claim.dispatchId !== "string" || typeof claim.decisionRef !== "string" || !/^[a-f0-9]{64}$/.test(claim.requestHash || "")) refuse("BOUND_DURABLE_CLAIM_REQUIRED");
        if (rows("SELECT 1 FROM claims WHERE dispatch_id=?", claim.dispatchId).length) return null;
        sql.exec("INSERT INTO claims VALUES (?,?,?)", claim.dispatchId, claim.decisionRef, claim.requestHash);
        return { ...claim, claimRef: "durable-claim:" + claim.dispatchId };
      });
    },
    async claimJob({ key, dispatchId, expiresAt }) {
      if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key) || typeof dispatchId !== "string" || !Number.isInteger(expiresAt) || expiresAt <= now()) refuse("EXACT_ONE_TIME_JOB_REQUIRED");
      return transactionSync(() => {
        if (rows("SELECT 1 FROM jobs WHERE key=?", key).length) refuse("MANAGED_JOB_REPLAY_REFUSED");
        sql.exec("INSERT INTO jobs VALUES (?,?,?)", key, dispatchId, expiresAt);
        return { claimed: true };
      });
    },
    async appendAudit(record) {
      const { recordHash, ...projection } = record || {};
      const fields = auditProjectionFields(projection);
      if (Object.keys(projection).sort().join("|") !== fields.sort().join("|") || recordHash !== dispatchHash(projection) || !Number.isInteger(projection.observedAt) || projection.observedAt > now()) refuse("EXACT_SANITIZED_AUDIT_REQUIRED");
      const sequence = transactionSync(() => {
        const claim = rows("SELECT * FROM claims WHERE dispatch_id=?", projection.dispatchId)[0];
        if (!claim || claim.request_hash !== projection.requestHash || claim.decision_ref !== projection.decisionRef) refuse("MANAGED_AUDIT_CLAIM_MISMATCH");
        const previous = rows("SELECT record_hash FROM events WHERE dispatch_id=? ORDER BY sequence DESC LIMIT 1", projection.dispatchId)[0];
        if (projection.previousHash !== (previous?.record_hash || null)) refuse("MANAGED_AUDIT_CHAIN_MISMATCH");
        sql.exec("INSERT INTO events (dispatch_id,record_hash,record_json) VALUES (?,?,?)", projection.dispatchId, recordHash, JSON.stringify(record));
        return rows("SELECT sequence FROM events WHERE record_hash=?", recordHash)[0].sequence;
      });
      const key = `training-audit/${projection.dispatchId}/${sequence}-${recordHash}.json`;
      const stored = await bucket.put(key, JSON.stringify(record), { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" }, customMetadata: { sha256: recordHash } });
      if (!stored) refuse("RESTRICTED_R2_AUDIT_NOT_RETAINED");
      transactionSync(() => sql.exec("UPDATE events SET retained=1 WHERE record_hash=?", recordHash));
      return { recordHash, auditRef: "r2:" + key };
    },
    async retainedEvents(dispatchId) {
      const entries = rows("SELECT record_json,retained FROM events WHERE dispatch_id=? ORDER BY sequence", dispatchId);
      if (entries.some((row) => row.retained !== 1)) refuse("MANAGED_AUDIT_RETENTION_INCOMPLETE");
      return entries.map((row) => JSON.parse(row.record_json));
    }
  };
}
__name(createManagedState, "createManagedState");

// ../../../workers/training-managed/custody-snapshot.mjs
var TABLES = { claims: ["dispatch_id", "decision_ref", "request_hash"], decisions: ["dispatch_id", "request_hash", "decision_json", "retained"], events: ["sequence", "dispatch_id", "record_hash", "record_json", "retained"], jobs: ["key", "dispatch_id", "expires_at"] };
var sameKeys = /* @__PURE__ */ __name((v, keys3) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join("|") === [...keys3].sort().join("|"), "sameKeys");
function validateCustodySnapshot(snapshot) {
  if (!sameKeys(snapshot, ["protocol", "environment", "observedAt", "tables", "schema", "sqliteSequence", "snapshotHash"]) || snapshot.protocol !== "CREATORLOOP_MANAGED_CUSTODY_SNAPSHOT_V1" || snapshot.environment !== "TRAINING" || !Number.isSafeInteger(snapshot.observedAt) || snapshot.observedAt < 0 || !sameKeys(snapshot.tables, Object.keys(TABLES)) || !Array.isArray(snapshot.schema) || !Array.isArray(snapshot.sqliteSequence)) refuse("EXACT_TRAINING_CUSTODY_SNAPSHOT_REQUIRED");
  const { snapshotHash, ...payload } = snapshot;
  if (snapshotHash !== dispatchHash(payload)) refuse("CUSTODY_SNAPSHOT_HASH_MISMATCH");
  for (const [table3, keys3] of Object.entries(TABLES)) if (!Array.isArray(snapshot.tables[table3]) || snapshot.tables[table3].some((row) => !sameKeys(row, keys3))) refuse("COMPLETE_CUSTODY_TABLES_REQUIRED");
  const { claims, decisions, events, jobs } = snapshot.tables;
  const unique = /* @__PURE__ */ __name((rows, key) => new Set(rows.map((r) => r[key])).size === rows.length, "unique");
  if (!unique(claims, "dispatch_id") || !unique(decisions, "dispatch_id") || !unique(events, "sequence") || !unique(events, "record_hash") || !unique(jobs, "key")) refuse("CUSTODY_DUPLICATE_STATE_REFUSED");
  const claimMap = new Map(claims.map((r) => [r.dispatch_id, r]));
  for (const d of decisions) {
    const value = JSON.parse(d.decision_json), r = validateDispatchRequest(value.request);
    if (r.dispatchId !== d.dispatch_id || dispatchHash(r) !== d.request_hash || value.approval?.dispatchId !== d.dispatch_id || value.approval.requestHash !== d.request_hash || ![0, 1].includes(d.retained)) refuse("IMMUTABLE_CUSTODY_DECISION_INVALID");
  }
  for (const c of claims) if (typeof c.dispatch_id !== "string" || typeof c.decision_ref !== "string" || !/^[a-f0-9]{64}$/.test(c.request_hash)) refuse("CUSTODY_REPLAY_CLAIM_INVALID");
  const last = /* @__PURE__ */ new Map();
  let sequence = 0;
  for (const row of events) {
    const record = JSON.parse(row.record_json), { recordHash, ...projection } = record, claim = claimMap.get(row.dispatch_id);
    if (!Number.isSafeInteger(row.sequence) || row.sequence <= sequence || !claim || record.dispatchId !== row.dispatch_id || record.requestHash !== claim.request_hash || record.decisionRef !== claim.decision_ref || recordHash !== row.record_hash || dispatchHash(projection) !== recordHash || record.previousHash !== (last.get(row.dispatch_id) || null) || ![0, 1].includes(row.retained)) refuse("CUSTODY_AUDIT_CHAIN_INVALID");
    last.set(row.dispatch_id, recordHash);
    sequence = row.sequence;
  }
  for (const j of jobs) if (!/^[a-f0-9]{64}$/.test(j.key) || !claimMap.has(j.dispatch_id) || !Number.isSafeInteger(j.expires_at)) refuse("CUSTODY_JOB_REPLAY_STATE_INVALID");
  const seq = snapshot.sqliteSequence;
  if (seq.some((r) => !sameKeys(r, ["name", "seq"]) || r.name !== "events" || !Number.isSafeInteger(r.seq) || r.seq < 0) || seq.length > 1 || events.length && (!seq.length || seq[0].seq < sequence)) refuse("CUSTODY_SQLITE_SEQUENCE_INVALID");
  const names = snapshot.schema.map((r) => r.name);
  const guards = ["claims_no_update", "claims_no_delete", "jobs_no_update", "jobs_no_delete", "decisions_no_delete", "decisions_body_immutable", "events_no_delete", "events_body_immutable"];
  if (snapshot.schema.some((r) => !sameKeys(r, ["type", "name", "tbl_name", "sql"]) || !["table", "trigger", "index"].includes(r.type) || typeof r.sql !== "string") || names.length !== new Set(names).size || [...Object.keys(TABLES), ...guards].some((name) => !names.includes(name))) refuse("CUSTODY_SCHEMA_GUARDS_MISSING");
  return { protocol: snapshot.protocol, environment: "TRAINING", snapshotHash, observedAt: snapshot.observedAt, counts: Object.fromEntries(Object.entries(snapshot.tables).map(([t, rows]) => [t, rows.length])), unretainedDecisions: decisions.filter((r) => r.retained === 0).length, unretainedEvents: events.filter((r) => r.retained === 0).length, readOnlyValidated: true, recoveryAccepted: false };
}
__name(validateCustodySnapshot, "validateCustodySnapshot");
function captureCustodySnapshot({ sql, transactionSync, now = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now") }) {
  if (!sql || typeof transactionSync !== "function") refuse("ACTUAL_CUSTODY_READ_PORT_REQUIRED");
  return transactionSync(() => {
    const payload = { protocol: "CREATORLOOP_MANAGED_CUSTODY_SNAPSHOT_V1", environment: "TRAINING", observedAt: now(), tables: {}, schema: [], sqliteSequence: [] };
    for (const [table3, columns] of Object.entries(TABLES)) payload.tables[table3] = sql.exec(`SELECT ${columns.join(",")} FROM ${table3} ORDER BY ${table3 === "events" ? "sequence" : columns[0]}`).toArray();
    payload.schema = sql.exec("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name IN ('claims','decisions','events','jobs') AND sql IS NOT NULL ORDER BY type,name").toArray();
    payload.sqliteSequence = sql.exec("SELECT name,seq FROM sqlite_sequence WHERE name='events' ORDER BY name").toArray();
    const result = { ...payload, snapshotHash: dispatchHash(payload) };
    validateCustodySnapshot(result);
    return result;
  });
}
__name(captureCustodySnapshot, "captureCustodySnapshot");

// ../../../workers/training-managed/capability.mjs
var capability_default = createCapability();
var TrainingExecutionState = class extends DurableObject {
  static {
    __name(this, "TrainingExecutionState");
  }
  constructor(ctx, env2) {
    super(ctx, env2);
    this.store = createManagedState({ sql: ctx.storage.sql, transactionSync: /* @__PURE__ */ __name((fn) => ctx.storage.transactionSync(fn), "transactionSync"), bucket: env2.EVIDENCE });
    this.custodyContext = ctx;
    this.custodyBucket = env2.EVIDENCE;
  }
  putDecision(value) {
    return this.store.putDecision(value);
  }
  decision(id2) {
    return this.store.decision(id2);
  }
  claimOnce(value) {
    return this.store.claimOnce(value);
  }
  claimJob(value) {
    return this.store.claimJob(value);
  }
  appendAudit(value) {
    return this.store.appendAudit(value);
  }
  retainedEvents(id2) {
    return this.store.retainedEvents(id2);
  }
  async exportCustody({ request, authority }) {
    if (!authority || authority.requestHash !== dispatchHash(request) || authority.versionId !== request.expectedVersionId || !Number.isSafeInteger(authority.ownerId) || authority.expiresAt <= Math.floor(Date.now() / 1e3)) refuse("BOUND_OWNER_EXPORT_AUTHORITY_REQUIRED");
    const snapshot = captureCustodySnapshot({ sql: this.custodyContext.storage.sql, transactionSync: /* @__PURE__ */ __name((fn) => this.custodyContext.storage.transactionSync(fn), "transactionSync") });
    const summary = validateCustodySnapshot(snapshot);
    const receipt = { protocol: "CREATORLOOP_OWNER_CUSTODY_EXPORT_RECEIPT_V1", exportId: request.exportId, decisionRef: request.decisionRef, ownerId: authority.ownerId, versionId: authority.versionId, configHash: authority.configHash, requestHash: authority.requestHash, approvalHash: authority.approvalHash, snapshotHash: snapshot.snapshotHash, observedAt: snapshot.observedAt, counts: summary.counts };
    const result = { snapshot, receipt: { ...receipt, receiptHash: dispatchHash(receipt) } };
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > CUSTODY_BODY_LIMIT) refuse("COMPLETE_EXPORT_TOO_LARGE_NO_PARTIAL_COPY");
    const ack = await this.custodyBucket.put(`training-custody/${request.exportId}.json`, JSON.stringify(result.receipt), { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" }, customMetadata: { sha256: result.receipt.receiptHash } });
    if (!ack || authority.expiresAt <= Math.floor(Date.now() / 1e3)) refuse("CUSTODY_EXPORT_RECEIPT_NOT_RETAINED");
    return result;
  }
  // No public fetch handler, key storage, generic SQL, delete, reset or approval-writing API.
};
export {
  TrainingExecutionState,
  capability_default as default
};
//# sourceMappingURL=capability.js.map
