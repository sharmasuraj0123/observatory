// Safe math expression compiler.
//
// Tokenizes, parses (recursive descent) and code-generates user expressions
// into plain JS functions. Only whitelisted identifiers, functions, numbers
// and operators can reach the generated code, so arbitrary JS cannot leak in.
// Supports implicit multiplication: "10(y - x)", "2pi", "3sin(t)".

// null-prototype maps: identifiers like "constructor" or "__proto__" must not
// pass the whitelist via the Object prototype chain
const FUNCS = Object.assign(Object.create(null), {
  sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan',
  asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan', atan2: 'Math.atan2',
  sinh: 'Math.sinh', cosh: 'Math.cosh', tanh: 'Math.tanh',
  exp: 'Math.exp', log: 'Math.log', log10: 'Math.log10', log2: 'Math.log2',
  sqrt: 'Math.sqrt', cbrt: 'Math.cbrt', abs: 'Math.abs', sign: 'Math.sign',
  floor: 'Math.floor', ceil: 'Math.ceil', round: 'Math.round',
  min: 'Math.min', max: 'Math.max', pow: 'Math.pow', hypot: 'Math.hypot',
  mod: 'H.mod', clamp: 'H.clamp',
});

// [min args, max args] per function; everything defaults to exactly 1
const ARITY = Object.assign(Object.create(null), {
  atan2: [2, 2], pow: [2, 2], mod: [2, 2], clamp: [3, 3],
  min: [2, 8], max: [2, 8], hypot: [1, 8],
});

const CONSTS = Object.assign(Object.create(null), {
  pi: 'Math.PI',
  e: 'Math.E',
  tau: '(Math.PI*2)',
  phi: '1.6180339887498949',
});

const HELPERS = Object.assign(Object.create(null), {
  mod: (a, b) => ((a % b) + b) % b,
  clamp: (x, lo, hi) => Math.min(Math.max(x, lo), hi),
});

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);
      if (!m || m[0] === '.') throw new Error(`Bad number at position ${i + 1}`);
      i += m[0].length;
      // "1.2.3" or "1..2" must be a syntax error, not an implicit product
      if (i < src.length && /[0-9.]/.test(src[i])) {
        throw new Error(`Malformed number near "${m[0]}${src[i]}"`);
      }
      tokens.push({ k: 'num', v: m[0] });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      const m = src.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      tokens.push({ k: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    if ('+-*/^(),'.includes(ch)) {
      tokens.push({ k: ch, v: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${ch}" at position ${i + 1}`);
  }

  // implicit multiplication: 2x, 3(..), )( , x y, (x)(y), 2pi
  const out = [];
  for (let j = 0; j < tokens.length; j++) {
    const cur = tokens[j];
    if (out.length) {
      const prev = out[out.length - 1];
      const prevIsValue = prev.k === 'num' || prev.k === ')' ||
        (prev.k === 'id' && !(FUNCS[prev.v] && cur.k === '('));
      const curStartsValue = cur.k === 'num' || cur.k === 'id' || cur.k === '(';
      if (prevIsValue && curStartsValue) out.push({ k: '*', v: '*' });
    }
    out.push(cur);
  }
  return out;
}

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (k) => {
    const t = next();
    if (!t || t.k !== k) throw new Error(`Expected "${k}"${t ? ` but found "${t.v}"` : ' but the expression ended'}`);
    return t;
  };

  function parseAdd() {
    let left = parseMul();
    while (peek() && (peek().k === '+' || peek().k === '-')) {
      const op = next().k;
      left = { k: 'bin', op, l: left, r: parseMul() };
    }
    return left;
  }
  function parseMul() {
    let left = parseUnary();
    while (peek() && (peek().k === '*' || peek().k === '/')) {
      const op = next().k;
      left = { k: 'bin', op, l: left, r: parseUnary() };
    }
    return left;
  }
  function parseUnary() {
    if (peek() && peek().k === '-') { next(); return { k: 'neg', x: parseUnary() }; }
    if (peek() && peek().k === '+') { next(); return parseUnary(); }
    return parsePow();
  }
  function parsePow() {
    const base = parsePrimary();
    if (peek() && peek().k === '^') {
      next();
      return { k: 'pow', l: base, r: parseUnary() }; // right-assoc, allows 2^-x
    }
    return base;
  }
  function parsePrimary() {
    const t = next();
    if (!t) throw new Error('Unexpected end of expression');
    if (t.k === 'num') return { k: 'num', v: t.v };
    if (t.k === '(') {
      const inner = parseAdd();
      expect(')');
      return inner;
    }
    if (t.k === 'id') {
      if (peek() && peek().k === '(' && FUNCS[t.v]) {
        next();
        const args = [];
        if (peek() && peek().k !== ')') {
          args.push(parseAdd());
          while (peek() && peek().k === ',') { next(); args.push(parseAdd()); }
        }
        expect(')');
        return { k: 'call', name: t.v, args };
      }
      return { k: 'var', name: t.v };
    }
    throw new Error(`Unexpected "${t.v}"`);
  }

  const ast = parseAdd();
  if (pos < tokens.length) throw new Error(`Unexpected "${tokens[pos].v}" after the end of the expression`);
  return ast;
}

function codegen(node, vars) {
  switch (node.k) {
    case 'num': return node.v;
    case 'var': {
      if (vars.has(node.name)) return `v.${node.name}`;
      if (CONSTS[node.name] !== undefined) return CONSTS[node.name];
      throw new Error(`Unknown variable "${node.name}" (allowed: ${[...vars].join(', ')}, pi, e, tau)`);
    }
    case 'call': {
      const fn = FUNCS[node.name];
      if (!fn) throw new Error(`Unknown function "${node.name}"`);
      const [lo, hi] = ARITY[node.name] || [1, 1];
      if (node.args.length < lo || node.args.length > hi) {
        throw new Error(`${node.name}() expects ${lo === hi ? lo : `${lo} to ${hi}`} argument${hi > 1 ? 's' : ''}, got ${node.args.length}`);
      }
      return `${fn}(${node.args.map((a) => codegen(a, vars)).join(',')})`;
    }
    case 'bin': return `(${codegen(node.l, vars)}${node.op}${codegen(node.r, vars)})`;
    case 'pow': return `Math.pow(${codegen(node.l, vars)},${codegen(node.r, vars)})`;
    case 'neg': return `(-${codegen(node.x, vars)})`;
    default: throw new Error('Internal parse error');
  }
}

// Compile an expression string into fn(scope) -> number.
// allowedVars: array of variable names readable from the scope object.
export function compileExpr(src, allowedVars) {
  if (!src || !src.trim()) throw new Error('Empty expression');
  const vars = new Set(allowedVars);
  const ast = parse(tokenize(src));
  const code = codegen(ast, vars);
  const raw = new Function('v', 'H', `"use strict";return (${code});`);
  const fn = (v) => raw(v, HELPERS);
  // smoke test so bad expressions fail at compile time, not mid-frame
  const probe = {};
  for (const k of vars) probe[k] = 0.5;
  const r = fn(probe);
  if (typeof r !== 'number') throw new Error('Expression does not produce a number');
  return fn;
}

export const EXPR_HELP = 'Operators + - * / ^, functions sin cos tan exp log sqrt abs atan2 min max mod clamp and more, constants pi, e, tau. Implicit multiplication works: 10(y - x).';
