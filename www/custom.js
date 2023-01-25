function refreshOnLovelaceChange() {
    const ha = document.querySelector("home-assistant")
    if (!ha || !ha.shadowRoot) return
    const nm = ha.shadowRoot.querySelector('notification-manager')
    if (!nm || !nm.shadowRoot) return
    const haToast = nm.shadowRoot.querySelector('ha-toast')
    if (!haToast) return
    if (haToast.text.indexOf('Refresh to see changes') >= 0) {
        console.log("Refreshing page...")
        location.reload()
    }
}
setInterval(refreshOnLovelaceChange, 500);