const API_URL = "https://resq-emergency-response3.onrender.com";
let token = localStorage.getItem("resq_token");
let currentLocation = null;

// ============================================================
// ELEMENTS
// ============================================================

const authScreen = document.getElementById("auth-screen");
const appScreen = document.getElementById("app-screen");

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

const switchAuth = document.getElementById("switch-auth");

const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const switchText = document.getElementById("switch-text");

// ============================================================
// SAFE RESPONSE READER
// ============================================================

async function readResponse(response) {
    const text = await response.text();

    if (!text) {
        return {
            data: {},
            text: ""
        };
    }

    try {
        return {
            data: JSON.parse(text),
            text
        };
    } catch {
        return {
            data: {},
            text
        };
    }
}

// ============================================================
// API REQUEST HELPER
// ============================================================

async function apiRequest(url, options = {}) {
    let response;

    try {
        response = await fetch(url, options);
    } catch (error) {
    console.error("FETCH ERROR:", error);
    throw new Error(
        `Unable to connect to the ResQ server: ${error.message}`
    );
}

    const result = await readResponse(response);

    if (!response.ok) {
        let message = "";

        if (result.data && result.data.detail) {
            message = result.data.detail;
        } else if (result.text) {
            message = result.text.substring(0, 200);
        } else {
            message = `Server returned HTTP ${response.status}.`;
        }

        throw new Error(message);
    }

    return result.data;
}

// ============================================================
// AUTH SWITCH
// ============================================================

if (switchAuth) {
    switchAuth.addEventListener("click", () => {
        const registering =
            !registerForm.classList.contains("hidden");

        if (registering) {
            registerForm.classList.add("hidden");
            loginForm.classList.remove("hidden");

            authTitle.textContent = "Welcome back";
            authSubtitle.textContent =
                "Sign in to access your emergency dashboard.";

            switchText.textContent =
                "Don't have an account?";

            switchAuth.textContent =
                "Create account";

        } else {
            loginForm.classList.add("hidden");
            registerForm.classList.remove("hidden");

            authTitle.textContent =
                "Create your account";

            authSubtitle.textContent =
                "Set up your secure emergency profile.";

            switchText.textContent =
                "Already have an account?";

            switchAuth.textContent =
                "Sign in";
        }
    });
}

// ============================================================
// REGISTER
// ============================================================

if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const button =
            registerForm.querySelector('button[type="submit"]');

        const name =
            document.getElementById("register-name").value.trim();

        const email =
            document.getElementById("register-email").value.trim();

        const phone =
            document.getElementById("register-phone").value.trim();

        const password =
            document.getElementById("register-password").value;

        if (!name || !email || !phone || !password) {
            showToast("Please complete all required fields.");
            return;
        }

        if (password.length < 8) {
            showToast("Password must contain at least 8 characters.");
            return;
        }

        button.disabled = true;
        button.textContent = "Creating account...";

        try {
            const data = await apiRequest(
                `${API_URL}/register`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        name,
                        email,
                        phone,
                        password
                    })
                }
            );

            showToast(
                data.message ||
                "Account created successfully."
            );

            registerForm.reset();

            // Switch to login form
            registerForm.classList.add("hidden");
            loginForm.classList.remove("hidden");

            authTitle.textContent =
                "Welcome back";

            authSubtitle.textContent =
                "Sign in to access your emergency dashboard.";

            switchText.textContent =
                "Don't have an account?";

            switchAuth.textContent =
                "Create account";

            document.getElementById(
                "login-email"
            ).value = email;

        } catch (error) {
            console.error("Registration error:", error);

            showToast(
                error.message ||
                "Account creation failed."
            );

        } finally {
            button.disabled = false;
            button.textContent = "Create Account";
        }
    });
}

// ============================================================
// LOGIN
// ============================================================

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const button =
            loginForm.querySelector('button[type="submit"]');

        const email =
            document.getElementById("login-email").value.trim();

        const password =
            document.getElementById("login-password").value;

        button.disabled = true;
        button.textContent = "Signing in...";

        try {
            const formData =
                new URLSearchParams();

            formData.append(
                "username",
                email
            );

            formData.append(
                "password",
                password
            );

            const data = await apiRequest(
                `${API_URL}/login`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded",
                        "Accept": "application/json"
                    },
                    body: formData
                }
            );

            if (!data.access_token) {
                throw new Error(
                    "Login succeeded but no access token was returned."
                );
            }

            token = data.access_token;

            localStorage.setItem(
                "resq_token",
                token
            );

            await loadApplication();

        } catch (error) {
            console.error("Login error:", error);

            showToast(
                error.message ||
                "Login failed."
            );

        } finally {
            button.disabled = false;
            button.textContent = "Sign In";
        }
    });
}

// ============================================================
// LOAD APPLICATION
// ============================================================

async function loadApplication() {
    if (!token) {
        showAuthScreen();
        return;
    }

    try {
        const user = await apiRequest(
            `${API_URL}/me`,
            {
                headers: {
                    "Authorization":
                        `Bearer ${token}`,
                    "Accept":
                        "application/json"
                }
            }
        );

        document.getElementById(
            "user-name"
        ).textContent = user.name;

        authScreen.classList.add("hidden");
        appScreen.classList.remove("hidden");

        await loadReports();

    } catch (error) {
        console.error("Session error:", error);

        localStorage.removeItem("resq_token");
        token = null;

        showAuthScreen();

        showToast(
            "Your session has expired. Please sign in again."
        );
    }
}

// ============================================================
// SHOW AUTH SCREEN
// ============================================================

function showAuthScreen() {
    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
}

// ============================================================
// NAVIGATION
// ============================================================

document.querySelectorAll("[data-section]")
    .forEach(button => {

        button.addEventListener("click", () => {

            const section =
                button.dataset.section;

            showSection(section);
        });
    });

function showSection(section) {

    document.querySelectorAll(".page-section")
        .forEach(element => {
            element.classList.add("hidden");
        });

    const target =
        document.getElementById(
            `${section}-section`
        );

    if (target) {
        target.classList.remove("hidden");
    }

    document.querySelectorAll(".nav-item")
        .forEach(button => {

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

    document.getElementById(
        "page-title"
    ).textContent =
        titles[section] || "Dashboard";

    if (section === "history") {
        loadReports();
    }
}

// ============================================================
// SOS HERO BUTTON
// ============================================================

document.getElementById("hero-sos")
    ?.addEventListener("click", () => {
        showSection("emergency");
    });

// ============================================================
// LOCATION
// ============================================================

document.getElementById("location-button")
    ?.addEventListener(
        "click",
        getLocation
    );

function getLocation() {

    const status =
        document.getElementById(
            "location-status"
        );

    if (!navigator.geolocation) {

        status.textContent =
            "Geolocation is not supported by this browser.";

        return;
    }

    status.textContent =
        "Requesting your location...";

    navigator.geolocation.getCurrentPosition(

        position => {

            currentLocation = {
                latitude:
                    position.coords.latitude,

                longitude:
                    position.coords.longitude
            };

            status.textContent =
                `Location ready: ` +
                `${currentLocation.latitude.toFixed(5)}, ` +
                `${currentLocation.longitude.toFixed(5)}`;

            showToast(
                "Location successfully obtained."
            );
        },

        error => {

            console.error(
                "Location error:",
                error
            );

            status.textContent =
                "Unable to obtain location. Please allow location access.";

            showToast(
                "Location permission is required."
            );
        },

        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
}

// ============================================================
// SEND SOS
// ============================================================

document.getElementById("emergency-form")
    ?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            if (!token) {
                showToast(
                    "Please sign in first."
                );
                return;
            }

            if (!currentLocation) {
                showToast(
                    "Please obtain your location first."
                );
                return;
            }

            const button =
                document.getElementById(
                    "submit-sos"
                );

            button.disabled = true;

            button.textContent =
                "Sending emergency alert...";

            const payload = {

                emergency_type:
                    document.getElementById(
                        "emergency-type"
                    ).value,

                description:
                    document.getElementById(
                        "description"
                    ).value,

                emergency_contact:
                    document.getElementById(
                        "emergency-contact"
                    ).value,

                medical_information:
                    document.getElementById(
                        "medical-info"
                    ).value,

                latitude:
                    currentLocation.latitude,

                longitude:
                    currentLocation.longitude
            };

            try {

                const data =
                    await apiRequest(
                        `${API_URL}/emergencies`,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json",

                                "Authorization":
                                    `Bearer ${token}`,

                                "Accept":
                                    "application/json"
                            },

                            body:
                                JSON.stringify(payload)
                        }
                    );

                document.getElementById(
                    "incident-id"
                ).textContent =
                    data.incident_id || "---";

                document.getElementById(
                    "success-modal"
                ).classList.remove("hidden");

                document.getElementById(
                    "emergency-form"
                ).reset();

                currentLocation = null;

                document.getElementById(
                    "location-status"
                ).textContent =
                    "Location has not been obtained.";

                await loadReports();

            } catch (error) {

                console.error(
                    "Emergency submission error:",
                    error
                );

                showToast(
                    error.message ||
                    "Unable to submit emergency."
                );

            } finally {

                button.disabled = false;

                button.textContent =
                    "🚨 Send Emergency Alert";
            }
        }
    );

// ============================================================
// CLOSE MODAL
// ============================================================

document.getElementById("close-modal")
    ?.addEventListener(
        "click",
        () => {

            document.getElementById(
                "success-modal"
            ).classList.add("hidden");

            showSection("dashboard");
        }
    );

// ============================================================
// LOAD REPORTS
// ============================================================

async function loadReports() {

    if (!token) return;

    try {

        const reports =
            await apiRequest(
                `${API_URL}/my-emergencies`,
                {
                    headers: {
                        "Authorization":
                            `Bearer ${token}`,

                        "Accept":
                            "application/json"
                    }
                }
            );

        updateStatistics(
            Array.isArray(reports)
                ? reports
                : []
        );

        renderReports(
            Array.isArray(reports)
                ? reports.slice(0, 5)
                : [],
            document.getElementById(
                "recent-reports"
            )
        );

        renderReports(
            Array.isArray(reports)
                ? reports
                : [],
            document.getElementById(
                "all-reports"
            )
        );

    } catch (error) {

        console.error(
            "Reports error:",
            error
        );
    }
}

// ============================================================
// STATISTICS
// ============================================================

function updateStatistics(
    reports = []
) {

    const total =
        reports.length;

    const active =
        reports.filter(
            report =>
                String(
                    report.status
                ).toUpperCase() === "ACTIVE"
        ).length;

    const resolved =
        reports.filter(
            report =>
                String(
                    report.status
                ).toUpperCase() === "RESOLVED"
        ).length;

    document.getElementById(
        "total-reports"
    ).textContent = total;

    document.getElementById(
        "active-reports"
    ).textContent = active;

    document.getElementById(
        "resolved-reports"
    ).textContent = resolved;
}

// ============================================================
// RENDER REPORTS
// ============================================================

function renderReports(
    reports,
    container
) {

    if (!container) return;

    if (!reports || !reports.length) {

        container.innerHTML = `
            <div class="empty-state">
                No emergency reports yet.
            </div>
        `;

        return;
    }

    container.innerHTML =
        reports.map(report => {

            const date =
                new Date(
                    report.created_at
                );

            const statusUpper =
                String(
                    report.status
                ).toUpperCase();

            return `
                <div class="report-card">

                    <div class="report-main">

                        <div class="report-icon">
                            🚨
                        </div>

                        <div>

                            <h4>
                                ${escapeHTML(
                                    report.emergency_type
                                )}
                            </h4>

                            <p>
                                ${date.toLocaleString()}
                            </p>

                        </div>

                    </div>

                    <span
                        class="status-badge ${
                            statusUpper === "ACTIVE"
                                ? "status-active"
                                : "status-resolved"
                        }"
                    >
                        ${escapeHTML(
                            report.status
                        )}
                    </span>

                </div>
            `;

        }).join("");
}

// ============================================================
// LOGOUT
// ============================================================

document.getElementById("logout-button")
    ?.addEventListener(
        "click",
        logout
    );

function logout() {

    localStorage.removeItem(
        "resq_token"
    );

    token = null;
    currentLocation = null;

    showAuthScreen();
}

// ============================================================
// TOAST
// ============================================================

function showToast(message) {

    const container =
        document.getElementById(
            "toast-container"
        );

    if (!container) return;

    const toast =
        document.createElement(
            "div"
        );

    toast.className = "toast";

    toast.textContent =
        message;

    container.appendChild(
        toast
    );

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// ============================================================
// SECURITY
// ============================================================

function escapeHTML(value) {

    if (!value) return "";

    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}

// ============================================================
// AUTO LOGIN
// ============================================================

if (token) {
    loadApplication();
}