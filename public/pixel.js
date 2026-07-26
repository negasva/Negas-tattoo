/* Bootstrap del Meta Pixel, compartido por index.html, privacidad.html y
   cuidados.html. Estaba repetido inline en las tres; salió a un archivo para
   poder quitar 'unsafe-inline' de script-src en la CSP.

   Esto solo carga la librería y encola los eventos. El init y el PageView los
   dispara quien tenga la configuración: script.js en la landing,
   page-config.js en las páginas legales. El ID viene de /api/config. */
!function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
    n.queue = []; t = b.createElement(e); t.async = !0;
    t.src = v; s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s)
}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
