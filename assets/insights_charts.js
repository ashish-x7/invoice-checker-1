/* Shared lightweight charts for Insights view (no external deps) */
/* Upgraded with hover tooltips and entrance animations for premium feel */

(function () {
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function toNumber(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var s = String(v).trim();
    if (!s) return 0;
    s = s.replace(/[, ]/g, "").replace(/^INR/i, "").replace(/^\u20B9/, "");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function formatCompact(n) {
    var x = toNumber(n);
    var abs = Math.abs(x);
    if (abs >= 1e7) return (x / 1e7).toFixed(2) + "Cr";
    if (abs >= 1e5) return (x / 1e5).toFixed(2) + "L";
    if (abs >= 1e3) return (x / 1e3).toFixed(2) + "K";
    return String(Math.round(x));
  }

  function formatINR(n) {
    var x = toNumber(n);
    try {
      return x.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    } catch {
      return String(x.toFixed(2));
    }
  }

  function trunc(str, len) {
    if (!str) return "";
    var s = String(str);
    return s.length > len ? s.substring(0, len - 3) + "..." : s;
  }

  function setupCanvas(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(10, Math.floor(rect.width));
    var h = Math.max(10, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h, rect: rect };
  }

  function drawGrid(ctx, w, h, opts) {
    var pad = opts.pad || 36;
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i <= 4; i++) {
      var y = pad + ((h - pad * 2) * i) / 4;
      ctx.moveTo(pad, Math.floor(y) + 0.5);
      ctx.lineTo(w - pad, Math.floor(y) + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  var tpNode = null;
  function showTooltip(x, y, text) {
    if (!tpNode) {
      tpNode = document.createElement("div");
      tpNode.style.position = "fixed";
      tpNode.style.background = "#0f172a";
      tpNode.style.color = "#fff";
      tpNode.style.padding = "6px 14px";
      tpNode.style.borderRadius = "8px";
      tpNode.style.fontSize = "13px";
      tpNode.style.fontWeight = "800";
      tpNode.style.pointerEvents = "none";
      tpNode.style.zIndex = "10000";
      tpNode.style.fontFamily = "'Outfit', system-ui, sans-serif";
      tpNode.style.boxShadow = "0 10px 15px -3px rgba(0,0,0,0.2), 0 4px 6px -2px rgba(0,0,0,0.1)";
      tpNode.style.transform = "translate(-50%, -100%)";
      tpNode.style.transition = "opacity 0.15s, top 0.1s ease-out, left 0.1s ease-out";
      tpNode.style.opacity = "0";
      tpNode.style.whiteSpace = "nowrap";
      document.body.appendChild(tpNode);
    }
    tpNode.innerHTML = text;
    tpNode.style.left = x + "px";
    tpNode.style.top = (y - 14) + "px";
    tpNode.style.opacity = "1";
  }

  function hideTooltip() {
    if (tpNode) tpNode.style.opacity = "0";
  }

  function easeOutQuart(x) {
    return 1 - Math.pow(1 - x, 4);
  }

  function animate(duration, renderFn) {
    var start = performance.now();
    renderFn(0);
    requestAnimationFrame(function step(now) {
      var elapsed = now - start;
      var p = Math.min(1, elapsed / duration);
      var e = easeOutQuart(p);
      renderFn(e);
      if (p < 1) requestAnimationFrame(step);
      else renderFn(1);
    });
  }

  function bindHover(canvas, renderFn, onHover) {
    var lastHover = null;
    canvas.onmousemove = function(e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var handled = onHover(mx, my, e.clientX, e.clientY);
      if (handled === undefined || handled === false) handled = null;
      
      if (handled !== lastHover) {
        lastHover = handled;
        renderFn(1, handled); // Redraw only if hover state changed
      }
    };
    canvas.onmouseleave = function() {
      hideTooltip();
      if (lastHover !== null) {
        lastHover = null;
        renderFn(1, null);
      }
    };
  }

  function drawLineChart(canvas, labels, values, theme) {
    var t = theme || {};
    var data = (values || []).map(toNumber);
    var labs = labels || [];
    var maxV = Math.max.apply(null, data.concat([1]));
    var minV = Math.min.apply(null, data.concat([0]));
    if (minV > 0) minV = 0;
    var range = Math.max(1, maxV - minV);

    var lastPts = [];
    function render(progress, hoverPt) {
      var s = setupCanvas(canvas);
      var ctx = s.ctx, w = s.w, h = s.h;
      var pad = 40;
      ctx.clearRect(0, 0, w, h);

      var innerW = Math.max(0, w - pad * 2);
      var innerH = Math.max(0, h - pad * 2);
      if (innerW === 0 || innerH === 0) return;

      drawGrid(ctx, w, h, { pad: pad });
      
      var validLength = Math.max(1, Math.floor(data.length * progress));
      if (validLength < 1) return;

      var pts = [];
      ctx.save();
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = t.line || "#0ea5e9";
      ctx.beginPath();
      for (var i = 0; i < validLength; i++) {
        var x = pad + (innerW * (data.length === 1 ? 0.5 : i / (data.length - 1)));
        var y = pad + innerH - ((data[i] - minV) / range) * innerH * progress;
        pts.push({ x: x, y: y, val: data[i], label: String(labs[i]||"").slice(5) });
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (validLength > 1) {
        var grd = ctx.createLinearGradient(0, pad, 0, h - pad);
        grd.addColorStop(0, (t.fillTop || "rgba(14,165,233,0.18)"));
        grd.addColorStop(1, (t.fillBottom || "rgba(14,165,233,0.02)"));
        ctx.fillStyle = grd;
        ctx.lineTo(pts[pts.length-1].x, h - pad);
        ctx.lineTo(pad, h - pad);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      if (progress >= 1 && pts.length > 0) {
        var picks = [0];
        if (pts.length > 2) picks.push(Math.floor(pts.length / 2));
        picks.push(pts.length - 1);

        ctx.save();
        ctx.fillStyle = "rgba(100,116,139,0.95)";
        ctx.font = "800 11px Outfit, system-ui, sans-serif";
        picks.forEach(function (pi) {
          if (pts[pi]) {
            ctx.textAlign = pi === 0 ? "left" : (pi === pts.length-1 ? "right" : "center");
            ctx.fillText(pts[pi].label, pts[pi].x, h - 12);
          }
        });
        
        if (hoverPt !== null && hoverPt !== undefined) {
          var p = pts[hoverPt];
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6, 0, Math.PI*2);
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = t.line || "#0ea5e9";
          ctx.stroke();
        }
        ctx.restore();
      }
      if (progress >= 1) lastPts = pts;
      return pts;
    }

    animate(600, function(p) { render(p, null); });

    bindHover(canvas, render, function(mx, my, cx, cy) {
      if (!data.length) return null;
      var pts = lastPts;
      if (!pts || !pts.length) return null;
      var closest = 0;
      var minDist = 9999;
      for (var i = 0; i < pts.length; i++) {
        var dist = Math.abs(pts[i].x - mx);
        if (dist < minDist) { minDist = dist; closest = i; }
      }
      if (minDist < 30) {
        showTooltip(cx, cy, String(labs[closest]||"") + "<br><span style='color:#a78bfa;'>Value: " + pts[closest].val + "</span>");
        return closest;
      }
      hideTooltip();
      return null;
    });
  }

  function drawBarChart(canvas, items, theme) {
    var t = theme || {};
    var isMulti = items.length > 0 && items[0].sale !== undefined;
    
    var bars = (items || []).map(function (it) {
      if (isMulti) {
        return { label: String(it.label || ""), sale: toNumber(it.sale), purchase: toNumber(it.purchase) };
      }
      return { label: String(it.label || ""), value: toNumber(it.value) };
    });

    var maxV = 1;
    bars.forEach(function(b) {
      if (isMulti) {
        maxV = Math.max(maxV, b.sale, b.purchase);
      } else {
        maxV = Math.max(maxV, b.value);
      }
    });

    function render(progress, hoverIdx) {
      var s = setupCanvas(canvas);
      var ctx = s.ctx, w = s.w, h = s.h;
      var pad = 40;
      ctx.clearRect(0, 0, w, h);
      var innerW = Math.max(0, w - pad * 2);
      var innerH = Math.max(0, h - pad * 2);
      if (innerW === 0 || innerH === 0) return;

      drawGrid(ctx, w, h, { pad: pad });
      var bw = innerW / Math.max(1, bars.length);

      ctx.save();
      for (var i = 0; i < bars.length; i++) {
        var b = bars[i];
        if (isMulti) {
          // Double Bar (Grouped)
          var xBase = pad + i * bw + bw * 0.1;
          var groupW = bw * 0.8;
          var barW = groupW * 0.45;
          
          // Sale Bar
          var sH = clamp((b.sale / maxV) * innerH, 0, innerH) * progress;
          var sY = pad + innerH - sH;
          var sGrd = ctx.createLinearGradient(0, sY, 0, sY + sH);
          sGrd.addColorStop(0, t.barTop || "#6366f1");
          sGrd.addColorStop(1, t.barBottom || "rgba(99, 102, 241, 0.4)");
          
          ctx.fillStyle = sGrd;
          if (hoverIdx === i) ctx.filter = "brightness(1.1)"; else ctx.filter = "none";
          if (sH > 0) { roundRect(ctx, xBase, sY, barW, sH, 6); ctx.fill(); }

          // Purchase Bar
          var pH = clamp((b.purchase / maxV) * innerH, 0, innerH) * progress;
          var pY = pad + innerH - pH;
          var pGrd = ctx.createLinearGradient(0, pY, 0, pY + pH);
          pGrd.addColorStop(0, t.barBottom || "#ef4444");
          pGrd.addColorStop(1, "rgba(239, 68, 68, 0.4)");
          
          ctx.fillStyle = pGrd;
          if (pH > 0) { roundRect(ctx, xBase + barW + 2, pY, barW, pH, 6); ctx.fill(); }

        } else {
          // Single Bar
          var x = pad + i * bw + bw * 0.18;
          var barW = bw * 0.64;
          var targetH = clamp((b.value / maxV) * innerH, 0, innerH);
          var barH = targetH * progress;
          var y = pad + innerH - barH;

          var grd = ctx.createLinearGradient(0, y, 0, y + barH);
          grd.addColorStop(0, t.barTop || "rgba(15, 118, 110, 0.95)");
          grd.addColorStop(1, t.barBottom || "rgba(15, 118, 110, 0.45)");
          ctx.fillStyle = grd;
          
          if (hoverIdx === i) ctx.filter = "brightness(1.15)";
          else ctx.filter = "none";
          
          if (barH > 0) { roundRect(ctx, x, y, barW, barH, 10); ctx.fill(); }
        }

        ctx.filter = "none";
        ctx.fillStyle = "rgba(100,116,139,0.95)";
        ctx.font = "900 11px Outfit, system-ui, sans-serif";
        ctx.textAlign = "center";
        
        ctx.fillText(trunc(b.label, 12), pad + i * bw + bw/2, h - 12);
      }
      ctx.restore();
    }

    animate(600, function(p) { render(p, null); });

    bindHover(canvas, render, function(mx, my, cx, cy) {
      if (!bars.length) return null;
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(10, rect.width), h = Math.max(10, rect.height), pad = 40;
      var innerW = w - pad * 2;
      var bw = innerW / Math.max(1, bars.length);
      
      for (var i = 0; i < bars.length; i++) {
        var x = pad + i * bw;
        if (mx >= x && mx <= x + bw) {
          if (isMulti) {
            showTooltip(cx, cy, "<b>" + bars[i].label + "</b><br><span style='color:#a5b4fc;'>" + (t.saleLabel||"Sale") + ": " + formatINR(bars[i].sale) + "</span><br><span style='color:#fca5a5;'>" + (t.purchaseLabel||"Issues") + ": " + formatINR(bars[i].purchase) + "</span>");
          } else {
            showTooltip(cx, cy, "<b>" + bars[i].label + "</b><br><span style='color:#a78bfa;'>Total: " + formatINR(bars[i].value) + "</span>");
          }
          return i;
        }
      }
      hideTooltip();
      return null;
    });
  }

  function drawPieChart(canvas, items, theme) {
    var t = theme || {};
    var data = (items || []).map(function (it) {
      return { label: String(it.label || ""), value: toNumber(it.value) };
    }).filter(function (d) { return d.value > 0; });

    var total = data.reduce(function (a, b) { return a + b.value; }, 0);
    
    function render(progress, hoverIdx) {
      var s = setupCanvas(canvas);
      var ctx = s.ctx, w = s.w, h = s.h;
      ctx.clearRect(0, 0, w, h);

      if (!total) {
        ctx.save();
        ctx.fillStyle = "rgba(100,116,139,0.95)";
        ctx.font = "800 13px Outfit, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No data", w / 2, h / 2);
        ctx.restore();
        return [];
      }

      var cx = w * 0.34;
      var cy = h * 0.52;
      var radius = Math.max(0, Math.min(w, h) * 0.30);
      if (radius < 5) return;
      var colors = (t.colors && t.colors.length ? t.colors : [
        "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#64748b"
      ]);

      var start = -Math.PI / 2;
      var slices = [];
      for (var i = 0; i < data.length; i++) {
        var frac = data[i].value / total;
        var end = start + (frac * Math.PI * 2) * progress;
        
        ctx.save();
        if (hoverIdx === i) {
          ctx.translate(cx, cy);
          ctx.scale(1.05, 1.05);
          ctx.translate(-cx, -cy);
        }
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        ctx.restore();
        
        slices.push({ start: start, end: end, data: data[i] });
        start = start + (frac * Math.PI * 2); 
        // We use full width spacing for proper hover calculation, but draw according to progress
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.58, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = "#0f172a";
      ctx.font = "950 14px Outfit, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Remarks", cx, cy - 4);
      ctx.fillStyle = "rgba(100,116,139,0.95)";
      ctx.font = "900 12px Outfit, system-ui, sans-serif";
      ctx.fillText(formatCompact(total) + " rows", cx, cy + 14);
      ctx.restore();

      var lx = w * 0.62;
      var ly = h * 0.18;
      ctx.save();
      ctx.textAlign = "left";
      ctx.font = "900 12px Outfit, system-ui, sans-serif";
      for (var j = 0; j < Math.min(7, data.length); j++) {
        var d = data[j];
        var ry = ly + j * 24;
        ctx.globalAlpha = progress;
        ctx.fillStyle = colors[j % colors.length];
        if (hoverIdx === j) ctx.fillRect(lx - 2, ry - 12, 16, 16);
        else ctx.fillRect(lx, ry - 10, 12, 12);
        
        ctx.fillStyle = "#0f172a";
        ctx.fillText(trunc(d.label, 18), lx + 22, ry);
        ctx.fillStyle = "rgba(100,116,139,0.95)";
        ctx.fillText("(" + formatCompact(d.value) + ")", lx + 160, ry);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      return slices;
    }

    animate(600, function(p) { render(p, null); });

    bindHover(canvas, render, function(mx, my, cx, cy) {
      if (!total) return null;
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(10, rect.width);
      var h = Math.max(10, rect.height);
      var scx = w * 0.34;
      var scy = h * 0.52;
      var radius = Math.min(w, h) * 0.30;
      
      var dx = mx - scx;
      var dy = my - scy;
      var dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist <= radius && dist >= radius * 0.58) {
        var angle = Math.atan2(dy, dx);
        if (angle < -Math.PI/2) angle += Math.PI * 2;
        var startAngle = -Math.PI/2;
        
        for (var i = 0; i < data.length; i++) {
          var frac = data[i].value / total;
          var endAngle = startAngle + frac * Math.PI * 2;
          if (angle >= startAngle && angle <= endAngle) {
            showTooltip(cx, cy, data[i].label + "<br><span style='color:#a78bfa;'>Rows: " + formatCompact(data[i].value) + "</span>");
            return i;
          }
          startAngle = endAngle;
        }
      }
      
      // Check Legend Hover
      var lx = w * 0.62;
      var ly = h * 0.18;
      for (var j = 0; j < Math.min(7, data.length); j++) {
        var ry = ly + j * 24;
        if (mx >= lx && mx <= w && my >= ry - 14 && my <= ry + 4) {
          showTooltip(cx, cy, data[j].label + "<br><span style='color:#a78bfa;'>Rows: " + formatCompact(data[j].value) + "</span>");
          return j;
        }
      }

      hideTooltip();
      return null;
    });
  }

  function drawDonutChart(canvas, items, theme) {
    var t = theme || {};
    var data = (items || []).map(function (it) {
      return { label: String(it.label || ""), value: toNumber(it.value) };
    }).filter(function (d) { return d.value > 0; });

    var total = data.reduce(function (a, b) { return a + b.value; }, 0);
    
    function render(progress, hoverIdx) {
      var s = setupCanvas(canvas);
      var ctx = s.ctx, w = s.w, h = s.h;
      ctx.clearRect(0, 0, w, h);

      if (!total) {
        ctx.save();
        ctx.fillStyle = "rgba(100,116,139,0.95)";
        ctx.font = "800 13px Outfit, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Insufficient Data", w / 2, h / 2);
        ctx.restore();
        return [];
      }

      var cx = w / 2;
      var cy = h / 2;
      var radius = Math.max(0, Math.min(w, h) * 0.40);
      if (radius < 5) return;
      var colors = (t.colors && t.colors.length ? t.colors : [
        "#6366f1", "#a855f7", "#ec4899", "#ef4444", "#f59e0b", "#22c55e", "#06b6d4"
      ]);

      var start = -Math.PI / 2;
      var slices = [];
      for (var i = 0; i < data.length; i++) {
        var frac = data[i].value / total;
        var end = start + (frac * Math.PI * 2) * progress;
        
        ctx.save();
        if (hoverIdx === i) {
          ctx.translate(cx, cy);
          ctx.scale(1.05, 1.05);
          ctx.translate(-cx, -cy);
        }
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        ctx.restore();
        
        slices.push({ start: start, end: end, data: data[i] });
        start = end; 
      }

      // Cut out the center
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.65, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      
      // Shadow for interior
      ctx.shadowBlur = 10;
      ctx.shadowColor = "rgba(0,0,0,0.05)";
      ctx.strokeStyle = "rgba(0,0,0,0.05)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Center Text
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(100,116,139,0.95)";
      ctx.font = "900 11px Outfit, sans-serif";
      ctx.fillText("TOTAL REVENUE", cx, cy - 8);
      ctx.fillStyle = "#0f172a";
      ctx.font = "950 15px Outfit, sans-serif";
      ctx.fillText(formatCompact(total), cx, cy + 12);
      ctx.restore();

      return slices;
    }

    animate(800, function(p) { render(p, null); });

    bindHover(canvas, render, function(mx, my, cx, cy) {
      if (!total) return null;
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(10, rect.width);
      var h = Math.max(10, rect.height);
      var scx = w/2, scy = h/2;
      var radius = Math.min(w, h) * 0.40;
      
      var dx = mx - scx, dy = my - scy;
      var dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist <= radius && dist >= radius * 0.65) {
        var angle = Math.atan2(dy, dx);
        if (angle < -Math.PI/2) angle += Math.PI * 2;
        var sAngle = -Math.PI/2;
        for (var i = 0; i < data.length; i++) {
          var frac = data[i].value / total;
          var eAngle = sAngle + frac * Math.PI * 2;
          if (angle >= sAngle && angle <= eAngle) {
            var pct = ((frac * 100).toFixed(1)) + "%";
            showTooltip(cx, cy, "<b>" + data[i].label + "</b><br><span style='color:#a78bfa;'>Share: " + pct + " (" + formatINR(data[i].value) + ")</span>");
            return i;
          }
          sAngle = eAngle;
        }
      }
      hideTooltip();
      return null;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    var rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawGlobalComparisonChart(canvas, data, theme) {
    var t = theme || {};
    var maxV = 1;
    data.forEach(function(d) {
      maxV = Math.max(maxV, toNumber(d.sale), toNumber(d.purchase));
    });

    function render(progress, hoverIdx) {
      var s = setupCanvas(canvas);
      var ctx = s.ctx, w = s.w, h = s.h;
      var pad = 40;
      ctx.clearRect(0, 0, w, h);
      var innerW = Math.max(0, w - pad * 2);
      var innerH = Math.max(0, h - pad * 2);
      if (innerW === 0 || innerH === 0) return;

      drawGrid(ctx, w, h, { pad: pad });
      var groupW = innerW / Math.max(1, data.length);

      ctx.save();
      for (var i = 0; i < data.length; i++) {
        var d = data[i];
        var gx = pad + i * groupW;
        var barW = groupW * 0.35;
        
        // Sale Bar
        var sH = clamp((toNumber(d.sale) / maxV) * innerH, 0, innerH) * progress;
        var sY = pad + innerH - sH;
        var grdS = ctx.createLinearGradient(0, sY, 0, sY + sH);
        grdS.addColorStop(0, "#fbbf24");
        grdS.addColorStop(1, "#d97706");
        ctx.fillStyle = grdS;
        roundRect(ctx, gx + groupW * 0.1, sY, barW, sH, 6);
        ctx.fill();

        // Purchase Bar
        var pH = clamp((toNumber(d.purchase) / maxV) * innerH, 0, innerH) * progress;
        var pY = pad + innerH - pH;
        var grdP = ctx.createLinearGradient(0, pY, 0, pY + pH);
        grdP.addColorStop(0, "#38bdf8");
        grdP.addColorStop(1, "#0284c7");
        ctx.fillStyle = grdP;
        roundRect(ctx, gx + groupW * 0.55, pY, barW, pH, 6);
        ctx.fill();

        // Labels
        ctx.fillStyle = "rgba(100,116,139,0.95)";
        ctx.font = "900 11px Outfit, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(d.label, gx + groupW * 0.5, h - 12);
        
        if (progress >= 1) {
            ctx.font = "800 10px Outfit, sans-serif";
            ctx.fillStyle = "#d97706";
            ctx.fillText(formatCompact(d.sale), gx + groupW * 0.27, sY - 6);
            ctx.fillStyle = "#0284c7";
            ctx.fillText(formatCompact(d.purchase), gx + groupW * 0.72, pY - 6);
        }
      }
      ctx.restore();
    }

    animate(600, render);
  }

  function drawUserPerformanceChart(canvas, data, theme) {
    var t = theme || {};
    var maxV = 1;
    data.forEach(function(d) {
      maxV = Math.max(maxV, toNumber(d.work), toNumber(d.disputes));
    });

    function render(progress, hoverIdx) {
      var s = setupCanvas(canvas);
      var ctx = s.ctx, w = s.w, h = s.h;
      var pad = 40;
      ctx.clearRect(0, 0, w, h);
      var innerW = Math.max(0, w - pad * 2);
      var innerH = Math.max(0, h - pad * 2);
      if (innerW === 0 || innerH === 0) return;

      drawGrid(ctx, w, h, { pad: pad });
      var groupW = innerW / Math.max(1, data.length);

      ctx.save();
      for (var i = 0; i < data.length; i++) {
        var d = data[i];
        var gx = pad + i * groupW;
        var barW = groupW * 0.35;
        
        // Work Bar (Blue)
        var wH = clamp((toNumber(d.work) / maxV) * innerH, 0, innerH) * progress;
        var wY = pad + innerH - wH;
        var grdW = ctx.createLinearGradient(0, wY, 0, wY + wH);
        grdW.addColorStop(0, "#3b82f6");
        grdW.addColorStop(1, "#1d4ed8");
        ctx.fillStyle = grdW;
        roundRect(ctx, gx + groupW * 0.1, wY, barW, wH, 6);
        ctx.fill();

        // Disputes Bar (Red)
        var dH = clamp((toNumber(d.disputes) / maxV) * innerH, 0, innerH) * progress;
        var dY = pad + innerH - dH;
        var grdD = ctx.createLinearGradient(0, dY, 0, dY + dH);
        grdD.addColorStop(0, "#ef4444");
        grdD.addColorStop(1, "#b91c1c");
        ctx.fillStyle = grdD;
        roundRect(ctx, gx + groupW * 0.55, dY, barW, dH, 6);
        ctx.fill();

        // Labels
        ctx.fillStyle = "rgba(100,116,139,0.95)";
        ctx.font = "900 11px Outfit, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(trunc(d.label, 8), gx + groupW * 0.5, h - 12);
        
        if (progress >= 1) {
            ctx.font = "800 10px Outfit, sans-serif";
            ctx.fillStyle = "#1d4ed8";
            ctx.fillText(formatCompact(d.work), gx + groupW * 0.27, wY - 6);
            ctx.fillStyle = "#b91c1c";
            ctx.fillText(formatCompact(d.disputes), gx + groupW * 0.72, dY - 6);
        }
      }
      ctx.restore();
    }

    animate(600, render);
  }

  window.InsightsCharts = {
    toNumber: toNumber,
    formatINR: formatINR,
    formatCompact: formatCompact,
    drawLineChart: drawLineChart,
    drawBarChart: drawBarChart,
    drawPieChart: drawPieChart,
    drawDonutChart: drawDonutChart,
    drawGlobalComparisonChart: drawGlobalComparisonChart,
    drawUserPerformanceChart: drawUserPerformanceChart
  };
})();
