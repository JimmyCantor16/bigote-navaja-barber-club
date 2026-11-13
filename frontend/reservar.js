(function () {
  "use strict";
  var T = JSON.parse(document.getElementById("rs-textos").textContent);
  var tarjeta = document.getElementById("rs-tarjeta");
  var seguir = document.getElementById("rs-seguir");
  var resumen = document.getElementById("rs-resumen");
  var barra = document.getElementById("rs-barra");
  var N = null;
  var st = { paso: 1, servicio: null, profesional: "", fecha: "", hora: "", google: null,
             nombre: "", email: "", telefono: "", nota: "" };
  var CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var DIAS = { es: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"], en: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] };
  var MESES = { es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
                en: ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] };
  var LANG = document.documentElement.lang === "en" ? "en" : "es";

  function el(tag, attrs, hijos) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "texto") n.textContent = attrs[k];
      else if (k === "clase") n.className = attrs[k];
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (hijos || []).forEach(function (h) { if (h) n.appendChild(typeof h === "string" ? document.createTextNode(h) : h); });
    return n;
  }
  function iniciales(t) { return t.split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0]; }).join("").toUpperCase(); }
  function pro(id) { return N.profesionales.filter(function (p) { return p.id === id; })[0]; }
  function fechaLarga(iso) {
    var p = iso.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
    return DIAS[LANG][d.getDay()] + " " + d.getDate() + " " + MESES[LANG][d.getMonth()];
  }
  function api(ruta, opciones) {
    return fetch(ruta, opciones).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, datos: d }; });
    });
  }
  function soloUnPro() { return N.profesionales.length < 2; }

  function pintarPasos() {
    var visibles = soloUnPro() ? [1, 3, 4] : [1, 2, 3, 4];
    var orden = visibles.indexOf(st.paso) + 1;
    document.getElementById("rs-paso-n").textContent = st.paso > 4 ? "" : T.paso.replace("{n}", Math.max(orden, 1)).replace("{t}", visibles.length);
    document.getElementById("rs-paso-etq").textContent = st.paso > 4 ? "" : T["p" + st.paso];
    document.querySelectorAll("#rs-pasos li").forEach(function (li) {
      var n = +li.getAttribute("data-paso");
      li.hidden = visibles.indexOf(n) < 0;
      li.className = n < st.paso ? "hecho" : n === st.paso ? "actual" : "";
      var b = li.querySelector("button");
      b.disabled = !(n < st.paso && st.paso <= 4);
      b.onclick = function () { ir(n); };
    });
    document.getElementById("rs-pasos").style.gridTemplateColumns = "repeat(" + visibles.length + ",1fr)";
  }

  function pintarResumen() {
    resumen.innerHTML = "";
    if (!st.servicio) {
      resumen.appendChild(el("small", { texto: T.resumen_servicio }));
      resumen.appendChild(el("b", { texto: T.resumen_vacio }));
      return;
    }
    var linea = st.servicio.nombre + (st.servicio.precio ? " · " + st.servicio.precio : "");
    var sub = [st.servicio.duracion + " " + T.min];
    if (st.profesional) sub.push(T.con + " " + pro(st.profesional).nombre);
    if (st.fecha) sub.push(fechaLarga(st.fecha) + (st.hora ? " · " + st.hora : ""));
    resumen.appendChild(el("small", { texto: sub.join(" · ") }));
    resumen.appendChild(el("b", { texto: linea }));
  }

  function listo() {
    if (st.paso === 1) return !!st.servicio;
    if (st.paso === 2) return true;
    if (st.paso === 3) return !!(st.fecha && st.hora);
    return false;
  }
  function actualizarBarra() {
    barra.hidden = st.paso >= 4;
    seguir.disabled = !listo();
    pintarResumen();
  }

  function ir(paso) {
    if (paso === 2 && soloUnPro()) paso = st.paso > 2 ? 1 : 3;
    st.paso = paso;
    pintarPasos();
    tarjeta.innerHTML = "";
    ({ 1: pasoServicio, 2: pasoProfesional, 3: pasoFecha, 4: pasoDatos })[paso]();
    actualizarBarra();
    if (paso > 1) window.scrollTo({ top: tarjeta.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  }
  seguir.addEventListener("click", function () { if (listo()) ir(st.paso + 1); });

  function opcion(activo, ava, titulo, sub, extra, alPulsar) {
    return el("button", { type: "button", clase: "rs-op", "aria-pressed": activo ? "true" : "false", onclick: alPulsar },
      [ava, el("span", {}, [el("b", { texto: titulo }), sub ? el("small", { texto: sub }) : null, extra]),
       arguments[6] || null]);
  }

  function pasoServicio() {
    var lista = el("div", { clase: "rs-lista" });
    function pintar(filtro) {
      lista.innerHTML = "";
      N.servicios.filter(function (s) {
        return !filtro || (s.nombre + " " + s.descripcion).toLowerCase().indexOf(filtro) >= 0;
      }).forEach(function (s) {
        var chip = el("span", { clase: "rs-chip", texto: "⏱ " + s.duracion + " " + T.min });
        var precio = s.precio ? el("span", { clase: "rs-precio", texto: s.precio }) : null;
        lista.appendChild(opcion(st.servicio && st.servicio.id === s.id,
          el("span", { clase: "rs-ava", texto: iniciales(s.nombre) }), s.nombre, s.descripcion, chip,
          function () { st.servicio = s; st.hora = ""; ir(soloUnPro() ? 3 : 2); }, precio));
      });
    }
    var buscar = el("input", { clase: "rs-buscar", type: "search", placeholder: T.buscar, "aria-label": T.buscar,
      oninput: function () { pintar(buscar.value.trim().toLowerCase()); } });
    tarjeta.appendChild(el("h2", { texto: T.q1 }));
    if (N.servicios.length > 5) tarjeta.appendChild(buscar);
    tarjeta.appendChild(lista);
    pintar("");
  }

  function pasoProfesional() {
    var lista = el("div", { clase: "rs-lista" });
    lista.appendChild(opcion(st.profesional === "", el("span", { clase: "rs-ava redondo", texto: "★" }),
      T.cualquiera, T.cualquiera_sub, null, function () { st.profesional = ""; st.hora = ""; ir(3); }));
    N.profesionales.forEach(function (p) {
      lista.appendChild(opcion(st.profesional === p.id, el("span", { clase: "rs-ava redondo", texto: iniciales(p.nombre) }),
        p.nombre, p.especialidad, null, function () { st.profesional = p.id; st.hora = ""; ir(3); }));
    });
    tarjeta.appendChild(el("h2", { texto: T.q2 }));
    tarjeta.appendChild(lista);
  }

  function pasoFecha() {
    var dias = el("div", { clase: "rs-dias", role: "group", "aria-label": T.p3 });
    var horas = el("div");
    var p = N.hoy.split("-"), base = new Date(+p[0], +p[1] - 1, +p[2]);
    var primero = "";
    for (var i = 0; i < Math.min(N.dias_adelante, 21); i++) {
      var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      var iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      var abre = N.agenda.dias.indexOf((d.getDay() + 6) % 7) >= 0;
      if (abre && !primero) primero = iso;
      (function (iso, abre, d) {
        var b = el("button", { type: "button", clase: "rs-dia", "aria-pressed": st.fecha === iso ? "true" : "false",
          title: abre ? fechaLarga(iso) : T.cerrado,
          onclick: function () { st.fecha = iso; st.hora = ""; marcar(); cargar(); } },
          [el("small", { texto: DIAS[LANG][d.getDay()] }), el("b", { texto: String(d.getDate()) }),
           el("small", { texto: MESES[LANG][d.getMonth()] })]);
        b.disabled = !abre;
        b.dataset.iso = iso;
        dias.appendChild(b);
      })(iso, abre, d);
    }
    function marcar() {
      dias.querySelectorAll(".rs-dia").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.iso === st.fecha ? "true" : "false"); });
      actualizarBarra();
    }
    function cargar() {
      horas.innerHTML = "";
      horas.appendChild(el("p", { clase: "rs-cargando", texto: T.cargando }));
      var q = "api/disponibilidad?servicio=" + encodeURIComponent(st.servicio.id) + "&fecha=" + st.fecha +
              "&profesional=" + encodeURIComponent(st.profesional);
      var pedida = st.fecha;
      api(q).then(function (r) {
        if (pedida !== st.fecha) return;
        horas.innerHTML = "";
        var lista = (r.ok && r.datos.horas) || [];
        if (!lista.length) { horas.appendChild(el("p", { clase: "rs-vacio", texto: T.sin_huecos })); return; }
        [[T.manana, 0, 720], [T.tarde, 720, 1080], [T.noche, 1080, 1440]].forEach(function (f) {
          var dentro = lista.filter(function (h) { var m = +h.slice(0, 2) * 60 + +h.slice(3); return m >= f[1] && m < f[2]; });
          if (!dentro.length) return;
          horas.appendChild(el("p", { clase: "rs-franja", texto: f[0] }));
          var rej = el("div", { clase: "rs-horas" });
          dentro.forEach(function (h) {
            rej.appendChild(el("button", { type: "button", clase: "rs-hora", "aria-pressed": st.hora === h ? "true" : "false",
              texto: h, onclick: function () {
                st.hora = h;
                rej.parentNode.querySelectorAll(".rs-hora").forEach(function (b) { b.setAttribute("aria-pressed", b.textContent === h ? "true" : "false"); });
                actualizarBarra();
              } }));
          });
          horas.appendChild(rej);
        });
      }).catch(function () { horas.innerHTML = ""; horas.appendChild(el("p", { clase: "rs-vacio", texto: T.fallo })); });
    }
    tarjeta.appendChild(el("h2", { texto: T.q3 }));
    tarjeta.appendChild(dias);
    tarjeta.appendChild(horas);
    if (!st.fecha) st.fecha = primero;
    marcar();
    if (st.fecha) cargar();
  }

  function detalle() {
    var filas = [[T.p1, st.servicio.nombre + (st.servicio.precio ? " · " + st.servicio.precio : "")],
                 [T.p3, fechaLarga(st.fecha) + " · " + st.hora + " (" + st.servicio.duracion + " " + T.min + ")"]];
    if (st.profesional) filas.splice(1, 0, [T.p2, pro(st.profesional).nombre]);
    return el("div", { clase: "rs-detalle" }, filas.map(function (f) {
      return el("div", {}, [el("span", { texto: f[0] }), el("b", { texto: f[1] })]);
    }));
  }

  function pasoDatos() {
    tarjeta.appendChild(el("h2", { texto: T.q4 }));
    tarjeta.appendChild(detalle());
    var cuerpo = el("div");
    tarjeta.appendChild(cuerpo);
    pintarDatos(cuerpo);
  }

  function campo(id, etiqueta, tipo, valor, extra) {
    var input = el(tipo === "textarea" ? "textarea" : "input", Object.assign({ id: id, name: id }, extra || {}));
    if (tipo !== "textarea") input.type = tipo;
    input.value = valor || "";
    return { caja: el("div", { clase: "campo" }, [el("label", { for: id, texto: etiqueta }), input,
             el("p", { clase: "error", id: "e-" + id })]), input: input };
  }

  function pintarDatos(cuerpo) {
    cuerpo.innerHTML = "";
    var form = el("form", { clase: "rs-form", novalidate: "" });
    if (st.google) {
      form.appendChild(el("div", { clase: "rs-quien" }, [
        el("span", {}, [T.conectado + " ", el("b", { texto: st.google.email })]),
        el("button", { type: "button", texto: T.cambiar, onclick: function () { st.google = null; pintarDatos(cuerpo); } })]));
    } else if (N.google_client_id) {
      var hueco = el("div", { id: "rs-google-btn" });
      cuerpo.appendChild(el("div", { clase: "rs-google" }, [hueco]));
      cuerpo.appendChild(el("p", { clase: "rs-o", texto: T.google_o }));
      montarGoogle(hueco, cuerpo);
    }
    var fN = campo("nombre", T.nombre, "text", st.nombre, { autocomplete: "name", maxlength: "80" });
    var fE = campo("email", T.email, "email", st.email, { autocomplete: "email", maxlength: "120" });
    var fT = campo("telefono", T.telefono, "tel", st.telefono, { autocomplete: "tel", maxlength: "24" });
    var fX = campo("nota", T.nota, "textarea", st.nota, { rows: "2", maxlength: "500" });
    if (!st.google) { form.appendChild(fN.caja); form.appendChild(fE.caja); }
    form.appendChild(fT.caja);
    form.appendChild(fX.caja);
    var boton = el("button", { type: "submit", clase: "btn", texto: T.confirmar });
    var aviso = el("p", { clase: "rs-aviso", role: "alert" });
    form.appendChild(boton);
    form.appendChild(aviso);
    form.appendChild(el("button", { type: "button", clase: "rs-enlace", texto: "← " + T.atras, onclick: function () { ir(3); } }));
    cuerpo.appendChild(form);

    function errores() {
      var e = {};
      if (!st.google && fN.input.value.trim().length < 2) e.nombre = T.e_nombre;
      if (!st.google && !CORREO.test(fE.input.value.trim())) e.email = T.e_email;
      var tel = fT.input.value.replace(/\D/g, "");
      if (tel && tel.length < 7) e.telefono = T.e_telefono;
      return e;
    }
    function validar(mostrar) {
      var e = errores();
      ["nombre", "email", "telefono"].forEach(function (k) {
        var p = form.querySelector("#e-" + k);
        if (p) p.textContent = mostrar && mostrar[k] ? (e[k] || "") : "";
      });
      boton.disabled = Object.keys(e).length > 0;
      return e;
    }
    var tocados = {};
    form.addEventListener("input", function (ev) {
      tocados[ev.target.name] = true;
      st[ev.target.name] = ev.target.value;
      validar(tocados);
    });
    form.addEventListener("focusout", function (ev) { if (ev.target.name) { tocados[ev.target.name] = true; validar(tocados); } });
    validar(null);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (Object.keys(validar({ nombre: 1, email: 1, telefono: 1 })).length) return;
      boton.disabled = true;
      boton.textContent = T.confirmando;
      aviso.textContent = "";
      api("api/reservas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        servicio: st.servicio.id, profesional: st.profesional, fecha: st.fecha, hora: st.hora,
        nombre: fN.input.value.trim(), email: fE.input.value.trim(), telefono: fT.input.value.trim(),
        nota: fX.input.value.trim(), credencial_google: st.google ? st.google.credencial : "" }) })
      .then(function (r) {
        if (r.ok) { confirmada(r.datos); return; }
        boton.disabled = false;
        boton.textContent = T.confirmar;
        if (r.status === 409) { aviso.textContent = T.ocupado; st.hora = ""; setTimeout(function () { ir(3); }, 1600); return; }
        aviso.textContent = (r.datos && typeof r.datos.detail === "string") ? r.datos.detail : T.fallo;
      }).catch(function () { boton.disabled = false; boton.textContent = T.confirmar; aviso.textContent = T.fallo; });
    });
  }

  function montarGoogle(hueco, cuerpo) {
    function dibujar() {
      google.accounts.id.initialize({ client_id: N.google_client_id, callback: function (resp) {
        try {
          var datos = JSON.parse(decodeURIComponent(escape(atob(resp.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))));
          st.google = { credencial: resp.credential, email: datos.email, nombre: datos.name || "" };
          pintarDatos(cuerpo);
        } catch (e) { /* si el token no se lee, el formulario sigue disponible */ }
      } });
      google.accounts.id.renderButton(hueco, { theme: "outline", size: "large", shape: "pill", text: "continue_with", locale: LANG });
    }
    if (window.google && google.accounts) { dibujar(); return; }
    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = dibujar;
    document.head.appendChild(s);
  }

  function confirmada(r) {
    st.paso = 5;
    pintarPasos();
    barra.hidden = true;
    tarjeta.innerHTML = "";
    var check = el("div", { clase: "rs-check" });
    check.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
    var caja = el("div", { clase: "rs-listo" }, [
      check, el("h2", { texto: T.listo }), el("p", { texto: T.codigo }), el("span", { clase: "rs-codigo", texto: r.codigo })]);
    tarjeta.appendChild(caja);
    var filas = [[T.p1, r.servicio + (r.precio ? " · " + r.precio : "")], [T.p2, r.profesional],
                 [T.p3, fechaLarga(r.fecha) + " · " + r.hora]];
    tarjeta.appendChild(el("div", { clase: "rs-detalle" }, filas.map(function (f) {
      return el("div", {}, [el("span", { texto: f[0] }), el("b", { texto: f[1] })]);
    })));
    tarjeta.appendChild(el("p", { texto: r.correo === "enviando" ? T.correo_ok + " " + r.email + "." : T.correo_no }));
    var acciones = el("div", { clase: "rs-acciones" }, [
      el("a", { clase: "btn", href: r.calendario, target: "_blank", rel: "noopener", texto: T.calendario })]);
    if (N.whatsapp) {
      var msg = encodeURIComponent(r.codigo + " · " + r.servicio + " · " + fechaLarga(r.fecha) + " " + r.hora + " · " + r.nombre);
      acciones.appendChild(el("a", { clase: "btn btn-borde", href: "https://wa.me/" + N.whatsapp + "?text=" + msg,
        target: "_blank", rel: "noopener", texto: T.whatsapp }));
    }
    acciones.appendChild(el("button", { type: "button", clase: "btn btn-borde", texto: T.otra, onclick: function () {
      st.servicio = null; st.hora = ""; st.fecha = ""; st.profesional = ""; ir(1); } }));
    acciones.appendChild(el("button", { type: "button", clase: "rs-enlace", texto: T.cancelar, onclick: function (ev) {
      var b = ev.currentTarget;
      api("api/reservas/" + encodeURIComponent(r.codigo) + "/cancelar", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: r.email }) })
      .then(function (x) { if (x.ok) { b.replaceWith(el("p", { clase: "rs-aviso", texto: T.cancelada })); } });
    } }));
    tarjeta.appendChild(acciones);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  api("api/negocio").then(function (r) {
    if (!r.ok) throw new Error("negocio");
    N = r.datos;
    var pedido = new URLSearchParams(location.search).get("servicio");
    var s = N.servicios.filter(function (x) { return x.id === pedido; })[0];
    if (s) { st.servicio = s; ir(soloUnPro() ? 3 : 2); } else { ir(1); }
  }).catch(function () {
    tarjeta.innerHTML = "";
    tarjeta.appendChild(el("p", { clase: "rs-vacio", texto: T.fallo }));
  });
})();
