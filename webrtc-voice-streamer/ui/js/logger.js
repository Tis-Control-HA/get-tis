let errorLogContainer;
let errorLogs;

export function initLogger(containerId, logsId, clearBtnId) {
  errorLogContainer = document.getElementById(containerId);
  errorLogs = document.getElementById(logsId);
  const clearErrorsBtn = document.getElementById(clearBtnId);

  if (clearErrorsBtn) {
    clearErrorsBtn.onclick = () => {
      errorLogs.innerHTML = "";
      errorLogContainer.classList.add("hidden");
      console.log("Error logs cleared.");
    };
  }
}

export function logError(message, err = null) {
  console.error(message, err || "");
  if (!errorLogContainer || !errorLogs) return;

  const time = new Date().toLocaleTimeString();
  const logEntry = document.createElement("div");
  logEntry.className = "py-1.5 border-b border-red-900/30 last:border-0";

  let errMsg = err ? err.message || err.toString() : "";
  // Avoid duplicate error message strings
  if (errMsg === message) errMsg = "";

  logEntry.textContent = `[${time}] ${message} ${errMsg ? " - " + errMsg : ""}`;
  errorLogs.prepend(logEntry);
  errorLogContainer.classList.remove("hidden");
}
