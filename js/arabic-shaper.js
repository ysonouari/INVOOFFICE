const JT_U = 1;
const JT_R = 2;
const JT_D = 3;

const JT = new Map([
  [0x0621, JT_U],[0x0622, JT_R],[0x0623, JT_R],[0x0624, JT_R],
  [0x0625, JT_R],[0x0626, JT_D],[0x0627, JT_R],[0x0628, JT_D],
  [0x0629, JT_R],[0x062A, JT_D],[0x062B, JT_D],[0x062C, JT_D],
  [0x062D, JT_D],[0x062E, JT_D],[0x062F, JT_R],[0x0630, JT_R],
  [0x0631, JT_R],[0x0632, JT_R],[0x0633, JT_D],[0x0634, JT_D],
  [0x0635, JT_D],[0x0636, JT_D],[0x0637, JT_D],[0x0638, JT_D],
  [0x0639, JT_D],[0x063A, JT_D],[0x0640, JT_D],[0x0641, JT_D],
  [0x0642, JT_D],[0x0643, JT_D],[0x0644, JT_D],[0x0645, JT_D],
  [0x0646, JT_D],[0x0647, JT_D],[0x0648, JT_R],[0x0649, JT_R],
  [0x064A, JT_D],[0x0671, JT_R],[0x0679, JT_D],[0x067A, JT_D],
  [0x067B, JT_D],[0x067E, JT_D],[0x067F, JT_D],[0x0680, JT_D],
  [0x0683, JT_D],[0x0684, JT_D],[0x0686, JT_D],[0x0687, JT_D],
  [0x0688, JT_R],[0x0689, JT_R],[0x068A, JT_R],[0x068B, JT_R],
  [0x068C, JT_R],[0x068D, JT_R],[0x068E, JT_R],[0x068F, JT_R],
  [0x0690, JT_R],[0x0691, JT_R],[0x0692, JT_R],[0x0693, JT_R],
  [0x0694, JT_R],[0x0695, JT_R],[0x0696, JT_R],[0x0697, JT_R],
  [0x0698, JT_R],[0x0699, JT_R],[0x069A, JT_D],[0x069B, JT_D],
  [0x069C, JT_D],[0x069D, JT_D],[0x069E, JT_D],[0x069F, JT_D],
  [0x06A0, JT_D],[0x06A1, JT_D],[0x06A2, JT_D],[0x06A3, JT_D],
  [0x06A4, JT_D],[0x06A5, JT_D],[0x06A6, JT_D],[0x06A7, JT_D],
  [0x06A8, JT_D],[0x06A9, JT_D],[0x06AA, JT_D],[0x06AB, JT_D],
  [0x06AC, JT_D],[0x06AD, JT_D],[0x06AE, JT_D],[0x06AF, JT_D],
  [0x06B0, JT_D],[0x06B1, JT_D],[0x06B2, JT_D],[0x06B3, JT_D],
  [0x06B4, JT_D],[0x06B5, JT_D],[0x06B6, JT_D],[0x06B7, JT_D],
  [0x06B8, JT_D],[0x06B9, JT_D],[0x06BA, JT_R],[0x06BB, JT_D],
  [0x06BC, JT_D],[0x06BD, JT_D],[0x06BE, JT_D],[0x06BF, JT_D],
  [0x06C0, JT_R],[0x06C1, JT_D],[0x06C2, JT_D],[0x06C3, JT_R],
  [0x06C4, JT_R],[0x06C5, JT_R],[0x06C6, JT_R],[0x06C7, JT_R],
  [0x06C8, JT_R],[0x06C9, JT_R],[0x06CA, JT_R],[0x06CB, JT_R],
  [0x06CC, JT_D],[0x06CD, JT_R],[0x06CE, JT_R],[0x06CF, JT_R],
  [0x06D0, JT_D],[0x06D1, JT_D],[0x06D2, JT_R],[0x06D3, JT_R],
  [0x06D5, JT_R],[0x06FA, JT_D],[0x06FB, JT_D],[0x06FC, JT_D],
  [0x06FF, JT_D],
]);

const PF = new Map([
  [0x0621,{isol:0xFE80}],
  [0x0622,{isol:0xFE81,fina:0xFE82}],
  [0x0623,{isol:0xFE83,fina:0xFE84}],
  [0x0624,{isol:0xFE85,fina:0xFE86}],
  [0x0625,{isol:0xFE87,fina:0xFE88}],
  [0x0626,{isol:0xFE89,fina:0xFE8A,init:0xFE8B,medi:0xFE8C}],
  [0x0627,{isol:0xFE8D,fina:0xFE8E}],
  [0x0628,{isol:0xFE8F,fina:0xFE90,init:0xFE91,medi:0xFE92}],
  [0x0629,{isol:0xFE93,fina:0xFE94}],
  [0x062A,{isol:0xFE95,fina:0xFE96,init:0xFE97,medi:0xFE98}],
  [0x062B,{isol:0xFE99,fina:0xFE9A,init:0xFE9B,medi:0xFE9C}],
  [0x062C,{isol:0xFE9D,fina:0xFE9E,init:0xFE9F,medi:0xFEA0}],
  [0x062D,{isol:0xFEA1,fina:0xFEA2,init:0xFEA3,medi:0xFEA4}],
  [0x062E,{isol:0xFEA5,fina:0xFEA6,init:0xFEA7,medi:0xFEA8}],
  [0x062F,{isol:0xFEA9,fina:0xFEAA}],
  [0x0630,{isol:0xFEAB,fina:0xFEAC}],
  [0x0631,{isol:0xFEAD,fina:0xFEAE}],
  [0x0632,{isol:0xFEAF,fina:0xFEB0}],
  [0x0633,{isol:0xFEB1,fina:0xFEB2,init:0xFEB3,medi:0xFEB4}],
  [0x0634,{isol:0xFEB5,fina:0xFEB6,init:0xFEB7,medi:0xFEB8}],
  [0x0635,{isol:0xFEB9,fina:0xFEBA,init:0xFEBB,medi:0xFEBC}],
  [0x0636,{isol:0xFEBD,fina:0xFEBE,init:0xFEBF,medi:0xFEC0}],
  [0x0637,{isol:0xFEC1,fina:0xFEC2,init:0xFEC3,medi:0xFEC4}],
  [0x0638,{isol:0xFEC5,fina:0xFEC6,init:0xFEC7,medi:0xFEC8}],
  [0x0639,{isol:0xFEC9,fina:0xFECA,init:0xFECB,medi:0xFECC}],
  [0x063A,{isol:0xFECD,fina:0xFECE,init:0xFECF,medi:0xFED0}],
  [0x0641,{isol:0xFED1,fina:0xFED2,init:0xFED3,medi:0xFED4}],
  [0x0642,{isol:0xFED5,fina:0xFED6,init:0xFED7,medi:0xFED8}],
  [0x0643,{isol:0xFED9,fina:0xFEDA,init:0xFEDB,medi:0xFEDC}],
  [0x0644,{isol:0xFEDD,fina:0xFEDE,init:0xFEDF,medi:0xFEE0}],
  [0x0645,{isol:0xFEE1,fina:0xFEE2,init:0xFEE3,medi:0xFEE4}],
  [0x0646,{isol:0xFEE5,fina:0xFEE6,init:0xFEE7,medi:0xFEE8}],
  [0x0647,{isol:0xFEE9,fina:0xFEEA,init:0xFEEB,medi:0xFEEC}],
  [0x0648,{isol:0xFEED,fina:0xFEEE}],
  [0x0649,{isol:0xFEEF,fina:0xFEF0}],
  [0x064A,{isol:0xFEF1,fina:0xFEF2,init:0xFEF3,medi:0xFEF4}],
  [0x0671,{isol:0xFB50,fina:0xFB51}],
  [0x0679,{isol:0xFB66,fina:0xFB67,init:0xFB68,medi:0xFB69}],
  [0x067E,{isol:0xFB56,fina:0xFB57,init:0xFB58,medi:0xFB59}],
  [0x0686,{isol:0xFB7A,fina:0xFB7B,init:0xFB7C,medi:0xFB7D}],
  [0x0688,{isol:0xFB88,fina:0xFB89}],
  [0x0691,{isol:0xFB8C,fina:0xFB8D}],
  [0x0698,{isol:0xFB8A,fina:0xFB8B}],
  [0x06A9,{isol:0xFB8E,fina:0xFB8F,init:0xFB90,medi:0xFB91}],
  [0x06AF,{isol:0xFB92,fina:0xFB93,init:0xFB94,medi:0xFB95}],
  [0x06BA,{isol:0xFB9E,fina:0xFB9F}],
  [0x06BE,{isol:0xFBAA,fina:0xFBAB,init:0xFBAC,medi:0xFBAD}],
  [0x06C0,{isol:0xFBA4,fina:0xFBA5}],
  [0x06C1,{isol:0xFBA6,fina:0xFBA7,init:0xFBA8,medi:0xFBA9}],
  [0x06CC,{isol:0xFBFC,fina:0xFBFD,init:0xFBFE,medi:0xFBFF}],
  [0x06D2,{isol:0xFBAE,fina:0xFBAF}],
  [0x06D3,{isol:0xFBB0,fina:0xFBB1}],
]);

function isArabic(cp) {
  return (cp >= 0x0600 && cp <= 0x06FF) ||
         (cp >= 0x0750 && cp <= 0x077F) ||
         (cp >= 0x0870 && cp <= 0x089F) ||
         (cp >= 0x08A0 && cp <= 0x08FF) ||
         (cp >= 0xFB50 && cp <= 0xFDFF) ||
         (cp >= 0xFE70 && cp <= 0xFEFF);
}

function isJoining(cp) {
  const jt = JT.get(cp);
  return jt === JT_R || jt === JT_D;
}

function isTransparent(cp) {
  return cp === 0x0640 || cp === 0x0670 ||
         (cp >= 0x064B && cp <= 0x065F) ||
         (cp >= 0x06D6 && cp <= 0x06ED);
}

function shapeSegment(codes) {
  const n = codes.length;
  if (n === 0) return [];
  const result = new Array(n);
  const jt = codes.map(cp => JT.get(cp) || JT_U);

  for (let i = 0; i < n; i++) {
    const cp = codes[i];
    const forms = PF.get(cp);
    if (!forms) { result[i] = cp; continue; }

    const type = jt[i];
    if (type === JT_U) { result[i] = forms.isol || cp; continue; }

    let ri = i - 1;
    while (ri >= 0 && isTransparent(codes[ri])) ri--;
    const prevTransmits = ri >= 0 && (jt[ri] === JT_D);
    const prevReceives = ri >= 0 && (type === JT_D || type === JT_R);
    const prevConnects = prevTransmits && prevReceives;

    let ni = i + 1;
    while (ni < n && isTransparent(codes[ni])) ni++;
    const nextTransmits = type === JT_D;
    const nextReceives = ni < n && (jt[ni] === JT_D || jt[ni] === JT_R);
    const nextConnects = nextTransmits && nextReceives;

    if (prevConnects && nextConnects) result[i] = forms.medi || forms.fina || forms.isol || cp;
    else if (prevConnects) result[i] = forms.fina || forms.isol || cp;
    else if (nextConnects) result[i] = forms.init || forms.isol || cp;
    else result[i] = forms.isol || cp;
  }

  return result;
}

export function shapeArabic(text) {
  if (!text) return text;
  const chars = [...text];
  const codes = chars.map(ch => {
    const cp = ch.codePointAt(0);
    return cp !== undefined ? cp : 0x20;
  });

  const segments = [];
  let segStart = 0;
  let inArabic = false;

  for (let i = 0; i < codes.length; i++) {
    const cp = codes[i];
    const arabic = isArabic(cp) || isTransparent(cp);
    if (i === 0) { inArabic = arabic; continue; }
    if (arabic !== inArabic) {
      segments.push({ start: segStart, end: i, arabic: inArabic });
      segStart = i;
      inArabic = arabic;
    }
  }
  segments.push({ start: segStart, end: codes.length, arabic: inArabic });

  const shaped = [];
  for (const seg of segments) {
    if (!seg.arabic) {
      for (let i = seg.start; i < seg.end; i++) shaped.push(codes[i]);
    } else {
      const segCodes = codes.slice(seg.start, seg.end);
      const shapedSeg = shapeSegment(segCodes);
      for (const cp of shapedSeg) shaped.push(cp);
    }
  }

  const CHUNK = 30000;
  let result = '';
  for (let i = 0; i < shaped.length; i += CHUNK) {
    result += String.fromCodePoint(...shaped.slice(i, i + CHUNK));
  }
  return result;
}
