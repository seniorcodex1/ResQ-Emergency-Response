const API_URL = "https://resq-emergency-response.onrender.com";

let token = localStorage.getItem("resq_token");
let currentLocation = null;

// ===============================
// ELEMENTS
// ===============================

const authScreen = document.getElementById("auth-screen");
const appScreen = document.getElementById("app-screen");

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

const switchAuth = document.getElementById("switch-auth");

const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const switchText = document.getElementById("switch-text");

// ===============================
// AUTH SWITCH
// ===============================

switchAuth.addEventListener("click", () => {
    const registering = !registerForm.classList.contains("hidden");

    if (registering) {
        registerForm.classList.add("hidden");
        loginForm.classList.remove("hidden");

        authTitle.textContent = "Welcome back";
        authSubtitle.textContent = "Sign in to access your emergency dashboard.";

        switchText.textContent = "Don't have an account?";
        switchAuth.textContent = "Create account";
    } else {
        loginForm.classList.add("hidden");
        registerForm.classList.remove("hidden");

        authTitle.textContent = "Create your account";
        authSubtitle.textContent = "Set up your secure emergency profile.";

        switchText.textContent = "Already have an account?";
        switchAuth.textContent = "Sign in";
    }
});

// ===============================
// REGISTER
// ===============================

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("register-name").value;
    const email = document.getElementById("register-email").value;
    const phone = document.getElementById("register-phone").value;
    const password = document.getElementById("register-password").value;

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name, email, phone, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Registration failed.");
        }

        showToast("Account created successfully.");
        switchAuth.click();
        document.getElementById("login-email").value = email;

    } catch (error) {
        showToast(error.message);
    }
});

// ===============================
// LOGIN
// ===============================

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
        const formData = new URLSearchParams();
        formData.append("username", email);
        formData.append("password", password);

        const response = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Login failed.");
        }

        token = data.access_token;
        localStorage.setItem("resq_token", token);

        await loadApplication();

    } catch (error) {
        showToast(error.message);
    }
});

// ===============================
// LOAD APPLICATION
// ===============================

async function loadApplication() {
    try {
        const response = await fetch(`${API_URL}/me`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error("Session expired.");
        }

        const user = await response.json();

        document.getElementById("user-name").textContent = user.name;
        authScreen.classList.add("hidden");
        appScreen.classList.remove("hidden");

        loadReports();

    } catch (error) {
        logout();
    }
}

// ===============================
// NAVIGATION
// ===============================

document.querySelectorAll("[data-section]").forEach(button => {
    button.addEventListener("click", () => {
        const section = button.dataset.section;
        showSection(section);
    });
});

function showSection(section) {
    document.querySelectorAll(".page-section")
        .forEach(element => element.classList.add("hidden"));

    const target = document.getElementById(`${section}-section`);

    if (target) {
        target.classList.remove("hidden");
    }

    document.querySelectorAll(".nav-item").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.section === section
        );
    });

    const titles = {
        dashboard: "Dashboard",
        emergency: "Report Emergency",
        history: "My Reports"
    };

    document.getElementById("page-title").textContent = titles[section] || "Dashboard";

    if (section === "history") {
        loadReports();
    }
}

// ===============================
// SOS HERO BUTTON
// ===============================

document.getElementById("hero-sos")?.addEventListener("click", () => {
    showSection("emergency");
});

// ===============================
// GET LOCATION
// ===============================

document.getElementById("location-button").addEventListener("click", getLocation);

function getLocation() {
    const status = document.getElementById("location-status");

    if (!navigator.geolocation) {
        status.textContent = "Geolocation is not supported by this browser.";
        return;
    }

    status.textContent = "Requesting your location...";

    navigator.geolocation.getCurrentPosition(
        position => {
            currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };

            status.textContent = `Location ready: ${currentLocation.latitude.toFixed(5)}, ${currentLocation.longitude.toFixed(5)}`;
            showToast("Location successfully obtained.");
        },
        error => {
            console.error(error);
            status.textContent = "Unable to obtain location. Please allow location access.";
            showToast("Location permission is required.");
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
}

// ===============================
// SEND SOS
// ===============================

document.getElementById("emergency-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentLocation) {
        showToast("Please obtain your location first.");
        return;
    }

    const button = document.getElementById("submit-sos");
    button.disabled = true;
    button.textContent = "Sending emergency alert...";

    const payload = {
        emergency_type: document.getElementById("emergency-type").value,
        description: document.getElementById("description").value,
        emergency_contact: document.getElementById("emergency-contact").value,
        medical_information: document.getElementById("medical-info").value,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude
    };

    try {
        const response = await fetch(`${API_URL}/emergencies`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Unable to submit emergency.");
        }

        document.getElementById("incident-id").textContent = data.incident_id;
        document.getElementById("success-modal").classList.remove("hidden");
        document.getElementById("emergency-form").reset();

        currentLocation = null;
        document.getElementById("location-status").textContent = "Location has not been obtained.";

        loadReports();

    } catch (error) {
        showToast(error.message);
    } finally {
        button.disabled = false;
        button.textContent = "🚨 Send Emergency Alert";
    }
});

// ===============================
// CLOSE MODAL
// ===============================

document.getElementById("close-modal").addEventListener("click", () => {
    document.getElementById("success-modal").classList.add("hidden");
    showSection("dashboard");
});

// ===============================
// LOAD REPORTS
// ===============================

async function loadReports() {
    try {
        const response = await fetch(`${API_URL}/my-emergencies`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            return;
        }

        const reports = await response.json();

        updateStatistics(reports);
        renderReports(reports.slice(0, 5), document.getElementById("recent-reports"));
        renderReports(reports, document.getElementById("all-reports"));

    } catch (error) {
        console.error(error);
    }
}

// ===============================
// STATISTICS
// ===============================

function updateStatistics(reports = []) {
    const total = reports.length;

    const active = reports.filter(
        report => String(report.status).toUpperCase() === "ACTIVE"
    ).length;

    const resolved = reports.filter(
        report => String(report.status).toUpperCase() === "RESOLVED"
    ).length;

    document.getElementById("total-reports").textContent = total;
    document.getElementById("active-reports").textContent = active;
    document.getElementById("resolved-reports").textContent = resolved;
}

// ===============================
// RENDER REPORTS
// ===============================

function renderReports(reports, container) {
    if (!container) return;

    if (!reports || !reports.length) {
        container.innerHTML = `
            <div class="empty-state">
                No emergency reports yet.
            </div>
        `;
        return;
    }

    container.innerHTML = reports.map(report => {
        const date = new Date(report.created_at);
        const statusUpper = String(report.status).toUpperCase();

        return `
            <div class="report-card">
                <div class="report-main">
                    <div class="report-icon">🚨</div>
                    <div>
                        <h4>${escapeHTML(report.emergency_type)}</h4>
                        <p>${date.toLocaleString()}</p>
                    </div>
                </div>
                <span class="status-badge ${statusUpper === "ACTIVE" ? "status-active" : "status-resolved"}">
                    ${escapeHTML(report.status)}
                </span>
            </div>
        `;
    }).join("");
}

// ===============================
// LOGOUT
// ===============================

document.getElementById("logout-button").addEventListener("click", logout);

function logout() {
    localStorage.removeItem("resq_token");
    token = null;
    currentLocation = null;

    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
}

// ===============================
// TOAST
// ===============================

function showToast(message) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// ===============================
// SECURITY
// ===============================

function escapeHTML(value) {
    if (!value) return "";
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// ===============================
// AUTO LOGIN
// ===============================

if (token) {
    loadApplication();
}