/** Offline, self-contained WebGL renderer. Emitted into Nava previews without external imports. */
export function navaScene3d(P: any, canvas: any, report: (message: string) => void): any {
  const noop = () => {};
  if (!canvas) return { obj: noop, cam: noop, scene: noop, draw: noop, dispose: noop, available: false, orbit: false };
  const ultra = P.graphics !== "low", doc = canvas.ownerDocument;
  const clamp = (n: any, lo: number, hi: number, fallback = lo) => Math.max(lo, Math.min(hi, Number.isFinite(Number(n)) ? Number(n) : fallback));
  const colorContext = doc.createElement("canvas").getContext("2d");
  const colors = new Map<string, number[]>();
  const rgb = (color: string) => {
    if (colors.has(color)) return colors.get(color)!;
    let value = color;
    if (colorContext) { colorContext.fillStyle = "#67f5a5"; colorContext.fillStyle = color; value = String(colorContext.fillStyle); }
    let result: number[];
    if (/^#[\da-f]{6}$/i.test(value)) result = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
    else if (/^#[\da-f]{3}$/i.test(value)) result = [1, 2, 3].map((i) => parseInt(value[i]!.repeat(2), 16) / 255);
    else result = (value.match(/[\d.]+/g) ?? ["103", "245", "165"]).slice(0, 3).map((n) => Number(n) / 255);
    colors.set(color, result); return result;
  };
  const objects: any[] = P.shapes.map((s: any) => ({ name: s.n, kind: s.kind, color: rgb(s.color), pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], material: [.4, .15, 0] }));
  const byName = new Map(objects.map((o) => [o.name, o]));
  let distance = 6, pitch = 18, yaw = 0, orbit = false, pending = 0, disposed = false, lost = false;
  let fog = rgb("#070b14"), fogNear = 10, fogFar = 35, light = [.45, .8, .6], intensity = 1.3, ambient = .28;
  let gl: any = canvas.getContext("webgl", { antialias: ultra, alpha: true, powerPreference: ultra ? "high-performance" : "low-power" });
  let program: any, locations: any = {}, meshes: any = {};
  const shaders: any[] = [], buffers: any[] = [];
  const matrix = (a: number[], b: number[]) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  const translate = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  const rx = (d: number) => { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
  const ry = (d: number) => { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
  const rz = (d: number) => { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
  const scale = (s: number[]) => [s[0]!, 0, 0, 0, 0, s[1]!, 0, 0, 0, 0, s[2]!, 0, 0, 0, 0, 1];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [a, b, c, a, c, d];
  const build = (kind: string) => {
    const tris: number[][] = [], normals: number[][] = [];
    const surface = (rows: number, cols: number, point: (u: number, v: number) => number[], normal: (u: number, v: number) => number[]) => {
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) for (const [u, v] of [[i / rows, j / cols], [(i + 1) / rows, j / cols], [(i + 1) / rows, (j + 1) / cols], [i / rows, j / cols], [(i + 1) / rows, (j + 1) / cols], [i / rows, (j + 1) / cols]]) { tris.push(point(u!, v!)); normals.push(normal(u!, v!)); }
    };
    const segments = ultra ? 48 : 20;
    if (kind === "کره") {
      const n = (u: number, v: number) => [Math.sin(u * Math.PI) * Math.cos(v * Math.PI * 2), Math.cos(u * Math.PI), Math.sin(u * Math.PI) * Math.sin(v * Math.PI * 2)];
      surface(ultra ? 32 : 12, segments, (u, v) => n(u, v).map((x) => x * .85), n);
    } else if (kind === "حلقه") {
      const n = (u: number, v: number) => [Math.cos(u * Math.PI * 2) * Math.cos(v * Math.PI * 2), Math.sin(v * Math.PI * 2), Math.sin(u * Math.PI * 2) * Math.cos(v * Math.PI * 2)];
      surface(segments, ultra ? 20 : 10, (u, v) => { const a = u * Math.PI * 2, b = v * Math.PI * 2, r = .85 + .22 * Math.cos(b); return [r * Math.cos(a), .22 * Math.sin(b), r * Math.sin(a)]; }, n);
    } else if (kind === "استوانه" || kind === "مخروط") {
      const cone = kind === "مخروط";
      surface(1, segments, (u, v) => { const a = v * Math.PI * 2, r = cone ? .75 * (1 - u) : .75; return [r * Math.cos(a), u * 1.5 - .75, r * Math.sin(a)]; }, (_, v) => [Math.cos(v * Math.PI * 2), cone ? .5 : 0, Math.sin(v * Math.PI * 2)]);
      for (let j = 0; j < segments; j++) {
        const a = j * Math.PI * 2 / segments, b = (j + 1) * Math.PI * 2 / segments;
        tris.push([0, -.75, 0], [.75 * Math.cos(a), -.75, .75 * Math.sin(a)], [.75 * Math.cos(b), -.75, .75 * Math.sin(b)]); normals.push([0, -1, 0], [0, -1, 0], [0, -1, 0]);
        if (!cone) { tris.push([0, .75, 0], [.75 * Math.cos(b), .75, .75 * Math.sin(b)], [.75 * Math.cos(a), .75, .75 * Math.sin(a)]); normals.push([0, 1, 0], [0, 1, 0], [0, 1, 0]); }
      }
    } else if (kind === "زمین") tris.push(...quad([-4, 0, 4], [4, 0, 4], [4, 0, -4], [-4, 0, -4]));
    else if (kind === "هرم") {
      const top = [0, .85, 0], a = [-.85, -.7, .85], b = [.85, -.7, .85], c = [.85, -.7, -.85], d = [-.85, -.7, -.85];
      tris.push(a, b, top, b, c, top, c, d, top, d, a, top, ...quad(d, c, b, a));
    } else {
      const v = (x: number, y: number, z: number) => [x * .75, y * .75, z * .75];
      tris.push(...quad(v(-1,-1,1),v(1,-1,1),v(1,1,1),v(-1,1,1)), ...quad(v(1,-1,-1),v(-1,-1,-1),v(-1,1,-1),v(1,1,-1)), ...quad(v(-1,1,1),v(1,1,1),v(1,1,-1),v(-1,1,-1)), ...quad(v(-1,-1,-1),v(1,-1,-1),v(1,-1,1),v(-1,-1,1)), ...quad(v(1,-1,1),v(1,-1,-1),v(1,1,-1),v(1,1,1)), ...quad(v(-1,-1,-1),v(-1,-1,1),v(-1,1,1),v(-1,1,-1)));
    }
    const pos: number[] = [], nor: number[] = [];
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i]!, b = tris[i + 1]!, c = tris[i + 2]!, u = b.map((x, k) => x - a[k]!), v = c.map((x, k) => x - a[k]!);
      const face = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      for (let k = 0; k < 3; k++) { pos.push(...tris[i + k]!); nor.push(...(normals[i + k] ?? face)); }
    }
    const buffer = (data: number[]) => { const b = gl.createBuffer(); buffers.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); return b; };
    return { bp: buffer(pos), bn: buffer(nor), count: pos.length / 3 };
  };
  const initialize = () => {
    if (!gl) return;
    meshes = {}; locations = {}; buffers.length = 0; shaders.length = 0;
    try {
      const shader = (type: number, source: string) => { const s = gl.createShader(type); shaders.push(s); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, `attribute vec3 p;attribute vec3 q;uniform mat4 m;uniform mat4 w;uniform mat3 nm;varying vec3 n;varying vec3 wp;void main(){wp=(w*vec4(p,1.0)).xyz;n=nm*q;gl_Position=m*vec4(p,1.0);}`));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `precision mediump float;
        uniform vec3 c,eye,ld,fc;uniform vec3 mat;uniform vec2 fogRange;uniform float power,amb,ground;uniform vec4 shadows[8];varying vec3 n,wp;
        void main(){vec3 N=normalize(n),V=normalize(eye-wp),L=normalize(ld);float diffuse=max(dot(N,L),0.0);float rough=clamp(mat.x,0.08,1.0),metal=clamp(mat.y,0.0,1.0);vec3 H=normalize(L+V);
        float spec=pow(max(dot(N,H),0.0),mix(180.0,5.0,rough))*diffuse;float rim=pow(1.0-max(dot(N,V),0.0),3.0);
        vec3 linear=pow(c,vec3(2.2));vec3 lit=linear*(amb+power*diffuse*(1.0-metal*.55))+mix(vec3(.15),linear,metal)*spec*power*(1.0-rough*.5)+linear*mat.z+vec3(.07,.13,.18)*rim;
        if(ground>.5){float shade=0.0;for(int i=0;i<8;i++){vec2 d=wp.xz-shadows[i].xy;shade+=exp(-dot(d,d)/max(shadows[i].z,.01))*shadows[i].w;}lit*=1.0-clamp(shade,0.0,.65);}
        lit=lit/(vec3(1.0)+lit);vec3 result=pow(lit,vec3(1.0/2.2));float f=smoothstep(fogRange.x,fogRange.y,length(eye-wp));gl_FragColor=vec4(mix(result,fc,f),1.0);}`));
      gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program); gl.enable(gl.DEPTH_TEST);
      for (const key of ["m", "w", "nm", "c", "eye", "ld", "fc", "mat", "fogRange", "power", "amb", "ground", "shadows[0]"]) locations[key] = gl.getUniformLocation(program, key);
      locations.p = gl.getAttribLocation(program, "p"); locations.q = gl.getAttribLocation(program, "q");
      for (const o of objects) if (!meshes[o.kind]) meshes[o.kind] = build(o.kind);
    } catch (e) { report(`3D shader: ${e instanceof Error ? e.message : String(e)}`); gl = null; }
  };
  const shadowData = new Float32Array(32);
  const draw = () => {
    if (!gl || disposed || lost) return;
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(ultra ? 2 : 1, globalThis.devicePixelRatio || 1);
    const width = Math.max(1, Math.min(2048, Math.round((rect.width || P.scene.w) * dpr))), height = Math.max(1, Math.min(2048, Math.round((rect.height || P.scene.h) * dpr)));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height); gl.clearColor(fog[0], fog[1], fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    const f = 1 / Math.tan(50 * Math.PI / 360), near = .1, far = 250, aspect = (rect.width || P.scene.w) / (rect.height || P.scene.h);
    const projection = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0];
    const view = matrix(translate(0, 0, -distance), matrix(rx(pitch), ry(yaw))), pv = matrix(projection, view);
    const cameraRotation = matrix(ry(-yaw), rx(-pitch));
    gl.uniform3fv(locations.eye, [cameraRotation[8]! * distance, cameraRotation[9]! * distance, cameraRotation[10]! * distance]);
    gl.uniform3fv(locations.ld, light); gl.uniform3fv(locations.fc, fog); gl.uniform2fv(locations.fogRange, [fogNear, fogFar]); gl.uniform1f(locations.power, intensity); gl.uniform1f(locations.amb, ambient);
    const floors = objects.filter((o) => o.kind === "زمین" && Math.abs(o.rot[0] % 360) < .001 && Math.abs(o.rot[2] % 360) < .001);
    for (const o of objects) {
      if (o.scale.some((s: number) => s <= 0)) continue;
      const mesh = meshes[o.kind];
      const rotation = matrix(ry(o.rot[1]), matrix(rx(o.rot[0]), rz(o.rot[2]))), model = matrix(translate(...o.pos as [number,number,number]), matrix(rotation, scale(o.scale)));
      // Inverse transpose for nonuniform scale, avoiding incorrect lighting on stretched meshes.
      const normal = [rotation[0]! / o.scale[0], rotation[1]! / o.scale[0], rotation[2]! / o.scale[0], rotation[4]! / o.scale[1], rotation[5]! / o.scale[1], rotation[6]! / o.scale[1], rotation[8]! / o.scale[2], rotation[9]! / o.scale[2], rotation[10]! / o.scale[2]];
      gl.uniformMatrix4fv(locations.m, false, new Float32Array(matrix(pv, model))); gl.uniformMatrix4fv(locations.w, false, new Float32Array(model)); gl.uniformMatrix3fv(locations.nm, false, new Float32Array(normal));
      gl.uniform3fv(locations.c, o.color); gl.uniform3fv(locations.mat, o.material); gl.uniform1f(locations.ground, ultra && floors.includes(o) ? 1 : 0);
      if (ultra && floors.includes(o)) {
        shadowData.fill(0); let i = 0;
        for (const s of objects) if (s.kind !== "زمین" && s.pos[1] >= o.pos[1] && s.scale.every((v: number) => v > 0) && i < 8) { const height = s.pos[1] - o.pos[1]; shadowData.set([s.pos[0], s.pos[2], Math.max(.05, (Math.max(s.scale[0], s.scale[2]) * .65 + height * .15) ** 2), .45 / (1 + height * .5)], i++ * 4); }
        gl.uniform4fv(locations["shadows[0]"], shadowData);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bp); gl.enableVertexAttribArray(locations.p); gl.vertexAttribPointer(locations.p, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bn); gl.enableVertexAttribArray(locations.q); gl.vertexAttribPointer(locations.q, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }
  };
  const requestDraw = () => { if (!pending && !disposed && !lost && gl) pending = requestAnimationFrame(() => { pending = 0; draw(); }); };
  const api: any = {
    get available() { return !!gl && !lost; }, get orbit() { return orbit; }, draw, requestDraw,
    obj: (op: string, name: string, args: any[], line: number) => {
      const o: any = byName.get(name); if (!o) throw new Error(`Line ${line}: object ${name} is missing.`);
      const v = (i: number) => clamp(args[i], -100000, 100000, 0);
      if (op === "بچرخان") o.rot = o.rot.map((r: number, i: number) => (r + v(i)) % 360);
      if (op === "جابجا") o.pos = [v(0), v(1), v(2)];
      if (op === "حرکت") o.pos = o.pos.map((p: number, i: number) => p + v(i));
      if (op === "اندازه") o.scale = [0, 1, 2].map((i) => clamp(args[args.length === 1 ? 0 : i], 0, 100, 1));
      if (op === "متریال") o.material = [clamp(args[0], .08, 1, .4), clamp(args[1], 0, 1, .15), clamp(args[2], 0, 4, 0)];
      if (op === "رنگشکل") o.color = rgb(String(args[0]));
      requestDraw();
    },
    cam: (d: number, x?: number, y?: number) => { distance = clamp(d, 1.5, 120, 6); if (x !== undefined) pitch = clamp(x, -85, 85, 18); if (y !== undefined) yaw = clamp(y, -36000, 36000, 0) % 360; requestDraw(); },
    scene: (op: string, a: any[]) => {
      if (op === "مدار") orbit = !!a[0];
      if (op === "مه") { fog = rgb(String(a[0])); fogNear = clamp(a[1], 0, 240, 10); fogFar = Math.max(fogNear + .1, clamp(a[2], .1, 250, 35)); }
      if (op === "نور") { light = [Number(a[0]) || 0, Number(a[1]) || 0, Number(a[2]) || 0]; if (Math.hypot(...light) < .001) light = [.45, .8, .6]; intensity = clamp(a[3], 0, 8, 1.3); }
      if (op === "محیط") ambient = clamp(a[0], 0, 2, .28);
      requestDraw();
    },
    dispose: () => { disposed = true; if (pending) cancelAnimationFrame(pending); observer?.disconnect(); if (gl && !lost) { buffers.forEach((b) => gl.deleteBuffer(b)); shaders.forEach((s) => gl.deleteShader(s)); if (program) gl.deleteProgram(program); } },
  };
  const pointers = new Map<number, { x: number; y: number }>(); let span = 0;
  const pinchSpan = () => { const a = [...pointers.values()]; return a.length >= 2 ? Math.hypot(a[0]!.x - a[1]!.x, a[0]!.y - a[1]!.y) : 0; };
  canvas.addEventListener("pointerdown", (e: any) => { if (!orbit) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture?.(e.pointerId); span = pinchSpan(); });
  canvas.addEventListener("pointermove", (e: any) => { const old = pointers.get(e.pointerId); if (!orbit || !old) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 1) { yaw += (e.clientX - old.x) * .35; pitch = clamp(pitch + (e.clientY - old.y) * .3, -85, 85); } else { const next = pinchSpan(); if (span > 0 && next > 0) distance = clamp(distance * span / next, 1.5, 120); span = next; } requestDraw(); });
  const release = (e: any) => { pointers.delete(e.pointerId); span = pinchSpan(); };
  canvas.addEventListener("pointerup", release); canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("wheel", (e: any) => { if (!orbit) return; e.preventDefault(); distance = clamp(distance * Math.exp(clamp(e.deltaY, -300, 300) * .001), 1.5, 120); requestDraw(); }, { passive: false });
  canvas.addEventListener("webglcontextlost", (e: any) => { e.preventDefault(); lost = true; if (pending) cancelAnimationFrame(pending); pending = 0; });
  canvas.addEventListener("webglcontextrestored", () => { lost = false; initialize(); requestDraw(); });
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(requestDraw) : null; observer?.observe(canvas);
  initialize(); requestDraw();
  if (!gl) report("WebGL is unavailable. The 3D scene cannot render on this device.");
  return api;
}
