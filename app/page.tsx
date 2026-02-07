"use client";

import React, { useMemo, useState } from "react";

type Tab = "duct" | "run";
type Shape = "round" | "rect";
type Material = "galv" | "pvc" | "flex";
type Mode = "fromSize" | "fromCfm";

function toNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundAreaIn2(dIn: number) {
  const r = dIn / 2;
  return Math.PI * r * r;
}

// Rect -> equivalent round approximation (inches)
function equivalentRoundIn(a: number, b: number) {
  if (a <= 0 || b <= 0) return 0;
  return 1.3 * Math.pow(a * b, 0.625) / Math.pow(a + b, 0.25);
}

// ---- Friction (Darcy-Weisbach) ----
function frictionFactorDarcy(Re: number, eps: number, D: number) {
  if (Re <= 0 || D <= 0) return 0;
  if (Re < 2300) return 64 / Re; // laminar
  const term = eps / (3.7 * D) + 5.74 / Math.pow(Re, 0.9);
  return 0.25 / Math.pow(Math.log10(term), 2);
}

function inToM(inches: number) {
  return inches * 0.0254;
}
function ftToM(ft: number) {
  return ft * 0.3048;
}
function paToInWg(pa: number) {
  return pa / 249.0889;
}
function cfmToM3s(cfm: number) {
  return cfm * 0.00047194745;
}

type FittingKey =
  | "elbow90"
  | "elbow45"
  | "teeThru"
  | "teeBranch"
  | "wye45"
  | "boot"
  | "transition";

const FITTING_LABELS: Record<FittingKey, string> = {
  elbow90: "90° Elbow",
  elbow45: "45° Elbow",
  teeThru: "Tee (Through)",
  teeBranch: "Tee (Branch)",
  wye45: "Wye 45°",
  boot: "Boot / Register",
  transition: "Transition",
};

// Reasonable starting defaults (ft) — editable in the UI.
// These vary by radius, fitting style, and size; use these as typical starting points.
const DEFAULT_EQ_LEN_FT: Record<FittingKey, number> = {
  elbow90: 25,
  elbow45: 15,
  teeThru: 20,
  teeBranch: 60,
  wye45: 30,
  boot: 20,
  transition: 15,
};

export default function Page() {
  const [tab, setTab] = useState<Tab>("duct");

  // Shared duct/air inputs
  const [mode, setMode] = useState<Mode>("fromSize");
  const [shape, setShape] = useState<Shape>("round");
  const [material, setMaterial] = useState<Material>("galv");

  const [targetFpm, setTargetFpm] = useState("700");

  // size inputs
  const [roundDia, setRoundDia] = useState("10");
  const [rectW, setRectW] = useState("10");
  const [rectH, setRectH] = useState("8");

  // cfm input (for fromCfm mode)
  const [cfm, setCfm] = useState("800");

  // Run loss inputs
  const [straightLenFt, setStraightLenFt] = useState("50");

  const [fitCount, setFitCount] = useState<Record<FittingKey, string>>({
    elbow90: "2",
    elbow45: "0",
    teeThru: "0",
    teeBranch: "0",
    wye45: "0",
    boot: "1",
    transition: "0",
  });

  const [fitEqLen, setFitEqLen] = useState<Record<FittingKey, string>>(
    Object.fromEntries(
      (Object.keys(DEFAULT_EQ_LEN_FT) as FittingKey[]).map((k) => [k, String(DEFAULT_EQ_LEN_FT[k])])
    ) as Record<FittingKey, string>
  );

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "1px solid #444",
    background: "#0f0f0f",
    color: "white",
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid #333",
    borderRadius: 14,
    padding: 14,
    background: "linear-gradient(#101010, #070707)",
  };

  const calc = useMemo(() => {
    const FPM = toNum(targetFpm);

    // Air assumptions (good default; can make editable later)
    const rho = 1.2; // kg/m^3
    const mu = 1.81e-5; // Pa*s

    // Roughness (meters)
    const eps =
      material === "galv"
        ? 0.00015
        : material === "pvc"
        ? 0.0000015
        : 0.0003; // flex approx

    // Determine CFM + Area based on mode
    let areaIn2 = 0;
    let usedCfm = 0;

    if (mode === "fromSize") {
      if (shape === "round") {
        const d = toNum(roundDia);
        areaIn2 = d > 0 ? roundAreaIn2(d) : 0;
      } else {
        const w = toNum(rectW);
        const h = toNum(rectH);
        areaIn2 = w > 0 && h > 0 ? w * h : 0;
      }

      const areaFt2 = areaIn2 / 144;
      usedCfm = areaFt2 > 0 ? areaFt2 * FPM : 0;
    } else {
      usedCfm = toNum(cfm);
      const areaFt2 = FPM > 0 ? usedCfm / FPM : 0;
      areaIn2 = areaFt2 * 144;
    }

    const areaFt2 = areaIn2 / 144;

    // Geometry for friction
    let Dh_in = 0;
    let eqRound = 0;

    if (shape === "round") {
      Dh_in = toNum(roundDia) || 0;
    } else {
      const w = toNum(rectW);
      const h = toNum(rectH);
      Dh_in = w > 0 && h > 0 ? (2 * w * h) / (w + h) : 0; // hydraulic diameter
      eqRound = equivalentRoundIn(w, h);
    }

    // Velocity
    const velFpm = areaFt2 > 0 ? usedCfm / areaFt2 : 0;

    // Friction per 100 ft
    const Q = cfmToM3s(usedCfm);
    const A = areaIn2 > 0 ? areaIn2 * (0.0254 * 0.0254) : 0; // in² -> m²
    const V = A > 0 ? Q / A : 0;

    const D = inToM(Dh_in);
    const Re = mu > 0 ? (rho * V * D) / mu : 0;
    const f = frictionFactorDarcy(Re, eps, D);

    const L = ftToM(100);
    const dpPaPer100ft = D > 0 ? f * (L / D) * (rho * V * V / 2) : 0;
    const dpInWgPer100ft = paToInWg(dpPaPer100ft);

    // Helpful “ideal round” from required area
    const idealRoundDia = areaIn2 > 0 ? Math.sqrt((4 * areaIn2) / Math.PI) : 0;

    return {
      usedCfm,
      areaIn2,
      areaFt2,
      velFpm,
      Dh_in,
      eqRound,
      dpInWgPer100ft,
      idealRoundDia,
    };
  }, [mode, shape, material, targetFpm, roundDia, rectW, rectH, cfm]);

  const run = useMemo(() => {
    const straight = toNum(straightLenFt);

    const items = (Object.keys(FITTING_LABELS) as FittingKey[]).map((k) => {
      const count = toNum(fitCount[k]);
      const eq = toNum(fitEqLen[k]);
      const eqTotal = count * eq;
      return { key: k, label: FITTING_LABELS[k], count, eq, eqTotal };
    });

    const fittingsEq = items.reduce((sum, it) => sum + it.eqTotal, 0);
    const totalEqLen = straight + fittingsEq;

    const frictionPer100 = calc.dpInWgPer100ft;
    const totalDrop = frictionPer100 * (totalEqLen / 100);

    return { items, straight, fittingsEq, totalEqLen, frictionPer100, totalDrop };
  }, [straightLenFt, fitCount, fitEqLen, calc.dpInWgPer100ft]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #141414, #070707 60%)",
        color: "white",
        padding: 22,
        fontFamily: "system-ui, Arial",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Ductulator (with Friction + Run Loss)</h1>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <button
            onClick={() => setTab("duct")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #444",
              background: tab === "duct" ? "#1b1b1b" : "transparent",
              color: "white",
              cursor: "pointer",
            }}
          >
            Duct / Friction
          </button>

          <button
            onClick={() => setTab("run")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #444",
              background: tab === "run" ? "#1b1b1b" : "transparent",
              color: "white",
              cursor: "pointer",
            }}
          >
            Run Loss (Length + Fittings)
          </button>
        </div>

        {/* Shared Inputs */}
        <div style={{ display: "grid", gap: 14 }}>
          <div style={cardStyle}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Air + Duct Inputs</div>

            <div style={{ display: "grid", gap: 12 }}>
              {/* Mode */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => setMode("fromSize")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #444",
                    background: mode === "fromSize" ? "#1b1b1b" : "transparent",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Type Size → Get CFM
                </button>
                <button
                  onClick={() => setMode("fromCfm")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #444",
                    background: mode === "fromCfm" ? "#1b1b1b" : "transparent",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Type CFM → Get Size
                </button>
              </div>

              {/* Material */}
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>Material</div>
                <select value={material} onChange={(e) => setMaterial(e.target.value as Material)} style={inputStyle}>
                  <option value="galv">Galvanized Steel</option>
                  <option value="pvc">PVC (smooth)</option>
                  <option value="flex">Flex Duct (rough)</option>
                </select>
              </label>

              {/* Shape */}
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700 }}>Shape:</div>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="radio" checked={shape === "round"} onChange={() => setShape("round")} />
                  Round
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="radio" checked={shape === "rect"} onChange={() => setShape("rect")} />
                  Rect
                </label>
              </div>

              {/* Velocity */}
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>Target / Actual Velocity (FPM)</div>
                <input value={targetFpm} onChange={(e) => setTargetFpm(e.target.value)} style={inputStyle} />
              </label>

              {/* CFM (if fromCfm) */}
              {mode === "fromCfm" && (
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>CFM</div>
                  <input value={cfm} onChange={(e) => setCfm(e.target.value)} style={inputStyle} />
                </label>
              )}

              {/* Size inputs */}
              {shape === "round" ? (
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Round Diameter (in)</div>
                  <input value={roundDia} onChange={(e) => setRoundDia(e.target.value)} style={inputStyle} />
                </label>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 700 }}>Rect Width (in)</div>
                    <input value={rectW} onChange={(e) => setRectW(e.target.value)} style={inputStyle} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 700 }}>Rect Height (in)</div>
                    <input value={rectH} onChange={(e) => setRectH(e.target.value)} style={inputStyle} />
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* TAB CONTENT */}
          {tab === "duct" ? (
            <div style={cardStyle}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Results</div>

              <div style={{ display: "grid", gap: 8, fontSize: 15 }}>
                <div>Area: <b>{calc.areaFt2.toFixed(3)}</b> ft²</div>
                <div>Area: <b>{calc.areaIn2.toFixed(1)}</b> in²</div>
                <div>Velocity: <b>{calc.velFpm.toFixed(0)}</b> FPM</div>
                <div>CFM: <b>{calc.usedCfm.toFixed(0)}</b></div>

                {shape === "rect" && (
                  <div>Equivalent Round: <b>{calc.eqRound.toFixed(2)}</b> in</div>
                )}

                {mode === "fromCfm" && (
                  <div>Ideal Round Diameter (from area): <b>{calc.idealRoundDia.toFixed(2)}</b> in</div>
                )}

                <div style={{ marginTop: 10, fontSize: 16 }}>
                  Friction Rate: <b>{calc.dpInWgPer100ft.toFixed(3)}</b> in. w.g. / 100 ft
                </div>
              </div>
            </div>
          ) : (
            <div style={cardStyle}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Run Loss</div>

              <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                <div style={{ fontWeight: 700 }}>Straight Duct Length (ft)</div>
                <input value={straightLenFt} onChange={(e) => setStraightLenFt(e.target.value)} style={inputStyle} />
              </label>

              <div style={{ opacity: 0.85, marginBottom: 10 }}>
                Add fittings (equivalent length). Defaults are editable.
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {(Object.keys(FITTING_LABELS) as FittingKey[]).map((k) => (
                  <div
                    key={k}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.3fr 0.6fr 0.8fr 0.8fr",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{FITTING_LABELS[k]}</div>

                    <div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Qty</div>
                      <input
                        value={fitCount[k]}
                        onChange={(e) => setFitCount((p) => ({ ...p, [k]: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Eq ft each</div>
                      <input
                        value={fitEqLen[k]}
                        onChange={(e) => setFitEqLen((p) => ({ ...p, [k]: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ fontSize: 13, opacity: 0.9 }}>
                      Eq ft total:{" "}
                      <b>
                        {(
                          toNum(fitCount[k]) * toNum(fitEqLen[k])
                        ).toFixed(0)}
                      </b>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16, borderTop: "1px solid #333", paddingTop: 12, display: "grid", gap: 8 }}>
                <div>Total fittings eq length: <b>{run.fittingsEq.toFixed(0)}</b> ft</div>
                <div>Total equivalent length: <b>{run.totalEqLen.toFixed(0)}</b> ft</div>
                <div>Friction rate: <b>{run.frictionPer100.toFixed(3)}</b> in. w.g. / 100 ft</div>
                <div style={{ fontSize: 18 }}>
                  Total run pressure drop: <b>{run.totalDrop.toFixed(3)}</b> in. w.g.
                </div>
              </div>

              <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12, lineHeight: 1.4 }}>
                Tip: Equivalent lengths vary by fitting style (radius, stamped vs smooth, flex conditions).
                Adjust the “Eq ft each” numbers to match your company charts/field experience.
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
