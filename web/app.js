let currentPage = 1;
const limit = 10;
let currentSearch = "";
let currentView = "clients";

const dataContainer = document.getElementById("data-container");
const pageInfo = document.getElementById("page-info");
const actorSwitcher = document.getElementById("actor-switcher");
const allControls = document.querySelectorAll('.controls'); // Grabs tabs, search, and pagination divs
const listHeading = document.getElementById("list-heading");
const navButtons = document.querySelectorAll('.nav-container .nav-btn');

navButtons.forEach(button => {
button.addEventListener('click', () => {
navButtons.forEach(btn => btn.classList.remove('active'));
button.classList.add('active');

    console.log("Clicked:", button.id);
    console.log("Active class added:", button.classList.contains('active'));
});

});
// const navButtons = document.querySelectorAll('.nav-btn');

// // --- Fetch Functions ---
// navButtons.forEach(button => {
//     button.addEventListener('click', () => {
//         navButtons.forEach(btn => btn.classList.remove('active'));
//         button.classList.add('active');
//     });
// });
function getStatusBadge(status) {
    const s = String(status).toUpperCase();
    if (s === 'FUNDED') return `<span class="badge badge-funded">${s}</span>`;
    if (s === 'IN_PROGRESS') return `<span class="badge badge-inprogress">${s.replace('_', ' ')}</span>`;
    if (s === 'COMPLETED') return `<span class="badge badge-completed">${s}</span>`;
    return `<span class="badge" style="background:#e9ecef; color:#495057;">${s}</span>`;
}

async function loadClients() {
    currentView = "clients";
    listHeading.textContent = "Clients List";
    document.getElementById("search-container").style.display = 'flex';
    showLoading(dataContainer, "Loading clients...");
    try {
        const response = await fetch(`http://localhost:3000/api/clients?page=${currentPage}&limit=${limit}&search=${currentSearch}`);
        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
}
        const result = await response.json();
        dataContainer.innerHTML = "";
        
        if (!result.data || result.data.length === 0) {
            showEmpty(dataContainer, "No clients found. Try a different search.");
            updatePagination(result.pagination || {
                page: currentPage,
                total: 0
            });
            return;
        }

        result.data.forEach(client => {
            const div = document.createElement("div");
            div.className = "card";
            div.style.cursor = "pointer"; // Indicates it is clickable
            div.innerHTML = `
                <strong>${client.name}</strong> 
                <br> Escrow Balance: $${client.escrow_balance}
                <br> <small>Click to view details</small>
            `;
            // Add click listener for detail view
            div.addEventListener("click", () => showDetail(client, "client"));
            dataContainer.appendChild(div);
        });

        updatePagination(result.pagination);
        populateSwitcher(result.data);
    } catch (error) {
        showError(error, dataContainer, loadClients);
    }
}


async function loadFreelancers() {
    currentView = "freelancers";
    listHeading.textContent = "Freelancers List";
    document.getElementById("search-container").style.display = "flex";

    showLoading(dataContainer, "Loading freelancers...");

    try {
        const response = await fetch(
            `http://localhost:3000/api/freelancers?page=${currentPage}&limit=${limit}&search=${currentSearch}`
        );

        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.data || result.data.length === 0) {
            showEmpty(dataContainer, "No freelancers found. Try a different search.");

            updatePagination(result.pagination || {
                page: currentPage,
                total: 0
            });
            return;
        }

        dataContainer.innerHTML = "";

        result.data.forEach(f => {
            const div = document.createElement("div");
            div.className = "card";
            div.style.cursor = "pointer";

            div.innerHTML = `
                <strong>${f.name}</strong>
                <br> Available: ${f.is_available ? "Yes" : "No"}
                <br> <small>Click to view details</small>
            `;

            div.addEventListener("click", () =>
                showDetail(f, "freelancer")
            );

            dataContainer.appendChild(div);
        });

        updatePagination(result.pagination);

    } catch (error) {
        showError(error, dataContainer, loadFreelancers);
    }
}


async function loadContracts() {
    currentView = "contracts";
    listHeading.textContent = "Contracts List";
    document.getElementById("search-container").style.display = "flex";

    showLoading(dataContainer, "Loading contracts...");

    try {
        const response = await fetch(
            `http://localhost:3000/api/contracts?page=${currentPage}&limit=${limit}&search=${currentSearch}`
        );

        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.data || result.data.length === 0) {
            showEmpty(dataContainer, "No contracts found. Try a different search.");

            updatePagination(result.pagination || {
                page: currentPage,
                total: 0
            });
            return;
        }

        dataContainer.innerHTML = "";

        result.data.forEach(contract => {
            const div = document.createElement("div");
            div.className = "card";
            div.style.cursor = "pointer";

            const cId = contract.id || contract.contract_id || "N/A";

            div.innerHTML = `
                <h3 style="margin-top: 0; color: #0369a1;">
                    Contract ID: ${cId}
                </h3>

                <p style="margin: 5px 0;">
                    <strong>Client:</strong> ${contract.client_name || "Unknown Client"}
                </p>

                <p style="margin: 5px 0;">
                    <strong>Freelancer:</strong> ${contract.freelancer_name || "Unknown Freelancer"}
                </p>

                <p style="margin: 10px 0 5px 0;">
                    <strong>Status:</strong> ${getStatusBadge(contract.status)}
                </p>

                <p style="margin: 5px 0;">
                    <strong>Amount:</strong> $${contract.amount || contract.budget || contract.payment_amount || 0}
                </p>
            `;

            div.addEventListener("click", () =>
                showDetail(contract, "contract")
            );

            dataContainer.appendChild(div);
        });

        updatePagination(result.pagination);

    } catch (error) {
        showError(error, dataContainer, loadContracts);
    }
}


// --- Detail View Logic ---


function showDetail(data, type) {
    allControls.forEach(control => control.style.display = 'none');
    document.getElementById("pagination-container").style.display = 'none';
    
    let html = `<button onclick="closeDetail()" style="margin-bottom: 15px; background-color: #e0f2fe; color: #0369a1;">⬅ Back to List</button>`;
    html += `<div class="card" style="border: 2px solid #ccc; padding: 20px;">`;
    
    if (type === "client") {
        html += `<h3>Client Details</h3>`;
        html += `<p><strong>Name:</strong> ${data.name}</p>`;
        html += `<p><strong>Database ID:</strong> ${data.id}</p>`;
        html += `<p><strong>Escrow Balance:</strong> $${data.escrow_balance}</p>`;
    } else if (type === "freelancer") {
        html += `<h3>Freelancer Details</h3>`;
        html += `<p><strong>Name:</strong> ${data.name}</p>`;
        html += `<p><strong>Database ID:</strong> ${data.id}</p>`;
        html += `<p><strong>Availability:</strong> ${data.is_available ? "Currently Available" : "Booked"}</p>`;
        html += `<p><strong>Coordinates:</strong> Lat ${data.latitude}, Lng ${data.longitude}</p>`;
    } else if (type === "contract") {
        html += `<h3>Contract Details</h3>`;
        html += `<p><strong>Contract ID:</strong> ${data.id}</p>`;
        html += `<p><strong>Status:</strong> ${data.status}</p>`;
        html += `<p><strong>Client:</strong> ${data.client_name} (ID: ${data.client_id})</p>`;
        html += `<p><strong>Freelancer:</strong> ${data.freelancer_name} (ID: ${data.freelancer_id})</p>`;
        html += `<p><strong>Agreed Budget:</strong> $${data.budget}</p>`;
        html += `<p><strong>Creation Date:</strong> ${new Date(data.created_at).toLocaleString()}</p>`;
        
        // Add buttons to transition contract statuses
        html += `<hr><div id="status-update-section" style="margin-top: 15px;">`;
        if (data.status === 'FUNDED') {
            html += `<button onclick="updateContractStatus('${data.id}', 'IN_PROGRESS')" style="background-color: #e0f2fe; color: #0369a1;">Start Gig (Set IN_PROGRESS)</button>`;
        } else if (data.status === 'IN_PROGRESS') {
            html += `<button onclick="updateContractStatus('${data.id}', 'COMPLETED')" style="background-color: #e0f2fe; color: #0369a1;">Finish Gig (Set COMPLETED)</button>`;
        } else {
            html += `<p><em>This contract is COMPLETED and closed.</em></p>`;
        }
        html += `<div id="status-update-result" style="margin-top: 10px; font-weight: bold;"></div>`;
        html += `</div>`;
    }
    
    html += `</div>`;
    dataContainer.innerHTML = html;
}

window.closeDetail = function() {
    // Changing 'block' to '' removes the JS override so the CSS flexbox works again
    allControls.forEach(control => control.style.display = ''); 
    document.getElementById("pagination-container").style.display = 'flex';
    document.getElementById("search-container").style.display = 'flex';
    refreshCurrentView();
};

window.updateContractStatus = async function(contractId, newStatus) {
    const resultDiv = document.getElementById("status-update-result");
    resultDiv.innerHTML = "Updating status...";
    resultDiv.style.color = "black";
    
    try {
        const response = await fetch(`http://localhost:3000/api/contracts/${contractId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            // This will catch the PostgreSQL partial unique index error
            resultDiv.innerHTML = `❌ Failed: ${result.error}`;
            resultDiv.style.color = "red";
        } else {
            resultDiv.innerHTML = `✅ Success! Status is now ${result.contract.status}. <br><small>Click 'Back to List' to refresh.</small>`;
            resultDiv.style.color = "green";
        }
    } catch (error) {
        resultDiv.innerHTML = `❌ System Error: ${error.message}`;
        resultDiv.style.color = "red";
    }
};

// --- Helper Functions ---

function updatePagination(pagination) {
    pageInfo.textContent = `Page ${pagination.page} (Total: ${pagination.total})`;
}

function showLoading(container, message = "Loading data...") {
    container.innerHTML = "";

    const div = document.createElement("div");
    div.className = "screen-message";
    div.textContent = message;

    container.appendChild(div);
}

function showEmpty(container, message = "No data found.") {
    container.innerHTML = "";

    const div = document.createElement("div");
    div.className = "screen-message empty";
    div.textContent = message;

    container.appendChild(div);
}

function showError(error, container = dataContainer, retry = null) {
    container.innerHTML = "";

    const div = document.createElement("div");
    div.className = "screen-message error";

    const message = document.createElement("p");
    message.textContent =
        `Unable to load data. ${error?.message || "Please try again."}`;

    div.appendChild(message);

    if (retry) {
        const button = document.createElement("button");
        button.textContent = "Retry";
        button.addEventListener("click", retry);
        div.appendChild(button);
    }

    container.appendChild(div);
}

function populateSwitcher(clients) {
    if (!clients || clients.length === 0) return;
    
    actorSwitcher.innerHTML = '<option value="">-- Select Client to Act As --</option>';
    clients.forEach(client => {
        const option = document.createElement("option");
        option.value = client.id;
        option.textContent = client.name;
        actorSwitcher.appendChild(option);
    });
}

function refreshCurrentView() {
    if (currentView === "clients") loadClients();
    if (currentView === "freelancers") loadFreelancers();
    if (currentView === "contracts") loadContracts();
}

// --- Event Listeners ---

document.getElementById("btn-clients").addEventListener("click", () => {
    document.getElementById("page-title").textContent = "Browse Platform";
    currentPage = 1;
    // currentSearch = document.getElementById("search-input").value;
    document.getElementById("search-container").style.display = 'flex';
    hideAllNonBrowse();
    loadClients();
});

document.getElementById("btn-freelancers").addEventListener("click", () => {
    document.getElementById("page-title").textContent = "Browse Platform";
    currentPage = 1;
    // currentSearch = document.getElementById("search-input").value;
    document.getElementById("search-container").style.display = 'flex';
    hideAllNonBrowse();
    loadFreelancers();
});

document.getElementById("btn-contracts").addEventListener("click", () => {
    document.getElementById("page-title").textContent = "Browse Platform";
    currentPage = 1;
    // currentSearch = document.getElementById("search-input").value;
    document.getElementById("search-container").style.display = 'flex';
    hideAllNonBrowse();
    loadContracts();
});

document.getElementById("search-input").addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
        currentSearch = event.target.value;
        currentPage = 1;
        refreshCurrentView();
    }
});

document.getElementById("btn-next").addEventListener("click", () => {
    currentPage++;
    refreshCurrentView();
});

document.getElementById("btn-prev").addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        refreshCurrentView();
    }
});

// Load clients by default on startup
loadClients();

// --- Day 2: Transaction Logic ---

const transactionContainer = document.getElementById("transaction-container");
const transactionResult = document.getElementById("transaction-result");

// Show the form when the tab is clicked
document.getElementById("btn-transaction").addEventListener("click", () => {
    document.getElementById("page-title").textContent = "Fund Gig";
    dataContainer.innerHTML = "";
    document.getElementById("pagination-container").style.display = 'none';
    document.getElementById("search-input").style.display = 'none';
    
    document.getElementById("audit-container").style.display = 'none';
    document.getElementById("analytics-container").style.display = 'none';
    document.getElementById("map-container").style.display = 'none';
    document.getElementById("reviews-container").style.display = 'none';
    document.getElementById("search-container").style.display = 'none';
    listHeading.style.display = "none";
    
    transactionContainer.style.display = 'block';
    transactionResult.style.display = 'none';
});

function hideAllNonBrowse() {
    document.getElementById("transaction-container").style.display = 'none';
    document.getElementById("audit-container").style.display = 'none';
    document.getElementById("analytics-container").style.display = 'none';
    document.getElementById("map-container").style.display = 'none';
    document.getElementById("reviews-container").style.display = 'none';

    // Restore the search bar and its input
    document.getElementById("search-container").style.display = 'flex';
    document.getElementById("search-input").style.display = 'block';

    // Restore pagination
    document.getElementById("pagination-container").style.display = 'flex';
    listHeading.style.display = "block";
}

document.getElementById("btn-clients").addEventListener("click", hideAllNonBrowse);
document.getElementById("btn-freelancers").addEventListener("click", hideAllNonBrowse);
document.getElementById("btn-contracts").addEventListener("click", hideAllNonBrowse);

// Handle the form submission

document.getElementById("submit-transaction").addEventListener("click", async () => {
    const submitButton = document.getElementById("submit-transaction");
    const clientId = actorSwitcher.value;
    const freelancerId = document.getElementById("trans-freelancer-id").value.trim();
    const budget = document.getElementById("trans-budget").value.trim();

    if (!clientId) {
        alert("Please select a Client from the top dropdown to act as the funder.");
        return;
    }

    if (!freelancerId || !budget || !Number.isFinite(Number(budget)) || Number(budget) <= 0) {
        transactionResult.style.display = "block";
        transactionResult.style.backgroundColor = "#f8d7da";
        transactionResult.textContent =
            "Please enter a valid Freelancer ID and a budget greater than zero.";
        return;
    }

    transactionResult.style.display = "block";
    transactionResult.style.backgroundColor = "#fff3cd";
    transactionResult.textContent = "Processing transaction...";

    submitButton.disabled = true;
    submitButton.textContent = "Processing...";

    try {
        const response = await fetch("http://localhost:3000/api/fund-gig", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId, freelancerId, budget })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Server returned HTTP ${response.status}`);
        }

        transactionResult.style.backgroundColor = "#d1e7dd";
        transactionResult.innerHTML = `
            <strong>✅ Gig Funded Successfully!</strong><br><br>
            <strong>Client Balances:</strong><br>
            Before: $${data.balanceBefore} ➔ After: $${data.balanceAfter}<br><br>
            <strong>Database Trigger Fired (Audit Log Created):</strong><br>
            Action: ${data.audit.action_type} of $${data.audit.amount_changed}<br>
            Log ID: ${data.audit.id}
        `;

        document.getElementById("trans-freelancer-id").value = "";
        document.getElementById("trans-budget").value = "";

    } catch (error) {
        transactionResult.style.backgroundColor = "#f8d7da";
        transactionResult.innerHTML = `
            <strong>Transaction Failed:</strong>
            ${error.message || "Unable to process the transaction. Please try again."}
        `;
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Submit Payment";
    }
});


// --- Day 2: Audit Trail Logic ---

const auditContainer = document.getElementById("audit-container");
const auditResults = document.getElementById("audit-results");

document.getElementById("btn-audit").addEventListener("click", () => {
    document.getElementById("page-title").textContent = "Audit Trail";
    dataContainer.innerHTML = "";
    document.getElementById("pagination-container").style.display = 'none';
    document.getElementById("search-input").style.display = 'none';
    
    document.getElementById("transaction-container").style.display = 'none';
    document.getElementById("analytics-container").style.display = 'none';
    document.getElementById("map-container").style.display = 'none';
    document.getElementById("reviews-container").style.display = 'none';
    document.getElementById("search-container").style.display = 'none';
    listHeading.style.display = "none";
    
    auditContainer.style.display = 'block';
    loadAudit();
});

document.getElementById("btn-fetch-audit").addEventListener("click", loadAudit);


async function loadAudit() {
    const clientId = actorSwitcher.value;

    if (!clientId) {
        auditResults.innerHTML =
            "<p style='color:red;'>Please select a Client from the top dropdown first.</p>";
        return;
    }

    const from = document.getElementById("audit-from").value;
    const to = document.getElementById("audit-to").value;

    let url = `http://localhost:3000/api/clients/${clientId}/audit?page=1&limit=50`;
    if (from) url += `&from=${from}`;
    if (to) url += `&to=${to}`;

    auditResults.innerHTML = "<p>Loading audit logs...</p>";

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
        }

        const result = await response.json();

        if (result.error) {
            throw new Error(result.error);
        }

        if (!result.data || result.data.length === 0) {
            auditResults.innerHTML =
                "<p>No audit records found for this period.</p>";
            return;
        }

        let html = `
            <table border="1" cellpadding="8"
                style="border-collapse: collapse; width: 100%; text-align: left; background: white;">
                <tr style="background-color: #cfe2ff;">
                    <th>Date</th>
                    <th>Action</th>
                    <th>Amount</th>
                    <th>Balance After</th>
                    <th>Running Net Change</th>
                </tr>`;

        result.data.forEach(log => {
            const dateStr = new Date(log.timestamp).toLocaleDateString();
            const color = log.action_type === "CREDIT" ? "green" : "red";

            html += `
                <tr>
                    <td>${dateStr}</td>
                    <td style="color: ${color}; font-weight: bold;">
                        ${log.action_type}
                    </td>
                    <td>$${Math.abs(log.amount_changed)}</td>
                    <td>$${log.balance_after}</td>
                    <td>$${log.net_change}</td>
                </tr>`;
        });

        html += "</table>";
        auditResults.innerHTML = html;

    } catch (error) {
        auditResults.innerHTML = "";

        const message = document.createElement("p");
        message.textContent =
            `Unable to load audit logs. ${error.message}`;
        auditResults.appendChild(message);

        const retryButton = document.createElement("button");
        retryButton.textContent = "Retry";
        retryButton.addEventListener("click", loadAudit);
        auditResults.appendChild(retryButton);
    }
}


// --- Day 3: Analytics Logic ---

const analyticsContainer = document.getElementById("analytics-container");
let revenueChartInstance = null; // Keeps track of the chart so we can destroy/recreate it

document.getElementById("btn-analytics").addEventListener("click", () => {
    document.getElementById("page-title").textContent = "Analytics Dashboard";
    dataContainer.innerHTML = "";
    document.getElementById("pagination-container").style.display = 'none';
    document.getElementById("search-input").style.display = 'none';
    
    document.getElementById("transaction-container").style.display = 'none';
    document.getElementById("audit-container").style.display = 'none';
    document.getElementById("map-container").style.display = 'none';
    document.getElementById("reviews-container").style.display = 'none';
    document.getElementById("search-container").style.display = 'none';
    listHeading.style.display = "none";
    
    analyticsContainer.style.display = 'block';
    loadAnalytics();
});

document.getElementById("btn-refresh-mv").addEventListener("click", async () => {
    const btn = document.getElementById("btn-refresh-mv");
    btn.textContent = "Refreshing...";
    btn.disabled = true;
    try {
        await fetch("http://localhost:3000/api/analytics/refresh", { method: "POST" });
        await loadAnalytics(); // Reload everything to show new data
    } catch (error) {
        alert("Failed to refresh materialized view");
    } finally {
        btn.textContent = "Refresh View";
        btn.disabled = false;
    }
});


async function loadAnalytics() {
    const summaryData = document.getElementById("summary-data");
    const rankingData = document.getElementById("ranking-data");
    const chartCanvas = document.getElementById("revenueChart");

    summaryData.textContent = "Loading summary metrics...";
    rankingData.textContent = "Loading rankings...";

    const chartContainer = chartCanvas.parentElement;
    let chartMessage = document.getElementById("chart-message");

    if (!chartMessage) {
        chartMessage = document.createElement("p");
        chartMessage.id = "chart-message";
        chartContainer.appendChild(chartMessage);
    }

    chartMessage.textContent = "Loading revenue chart...";

    try {
        // 1. Fetch Summary
        const summaryRes = await fetch(
            "http://localhost:3000/api/analytics/summary"
        );

        if (!summaryRes.ok) {
            throw new Error(`Summary API returned HTTP ${summaryRes.status}`);
        }

        const summary = await summaryRes.json();

        const refreshTime = summary.lastRefreshedAt
            ? new Date(summary.lastRefreshedAt).toLocaleString()
            : "Never";

        summaryData.innerHTML = `
            <strong>Total Earnings:</strong> $${summary.total_earnings ?? 0}<br>
            <strong>Completed Contracts:</strong> ${summary.completed_contracts ?? 0}<br>
            <small style="color: gray;">Last Refreshed: ${refreshTime}</small>
        `;

        // 2. Fetch Rankings
        const rankRes = await fetch(
            "http://localhost:3000/api/analytics/rankings"
        );

        if (!rankRes.ok) {
            throw new Error(`Rankings API returned HTTP ${rankRes.status}`);
        }

        const rankData = await rankRes.json();

        if (!rankData.data || rankData.data.length === 0) {
            rankingData.textContent = "No ranking data available.";
        } else {
            let rankHtml = `
                <table border="1"
                    style="width: 100%; border-collapse: collapse; text-align: left;">
                    <tr style="background: #e2e3e5;">
                        <th>Rank</th><th>Name</th><th>Earnings</th>
                    </tr>`;

            rankData.data.forEach(r => {
                rankHtml += `
                    <tr>
                        <td>#${r.revenue_rank}</td>
                        <td>${r.freelancer_name}</td>
                        <td>$${r.total_earnings}</td>
                    </tr>`;
            });

            rankingData.innerHTML = rankHtml + "</table>";
        }

        // // 3. Fetch Moving Average
        // const movingRes = await fetch(
        //     "http://localhost:3000/api/analytics/moving-average"
        // );

        // if (!movingRes.ok) {
        //     throw new Error(`Moving Average API returned HTTP ${movingRes.status}`);
        // }

        // const movingData = await movingRes.json();

        // if (!movingData.data || movingData.data.length === 0) {
        //     chartMessage.textContent = "No revenue data available for the chart.";

        //     if (revenueChartInstance) {
        //         revenueChartInstance.destroy();
        //         revenueChartInstance = null;
        //     }

        //     return;
        // }

        // const chartData = movingData.data.slice(0, 30);
        // const labels = chartData.map(
        //     d => new Date(d.revenue_date).toLocaleDateString()
        // );
        // const averages = chartData.map(
        //     d => parseFloat(d.moving_avg_7day)
        // );

        // if (revenueChartInstance) {
        //     revenueChartInstance.destroy();
        // }

        // const ctx = chartCanvas.getContext("2d");

        // revenueChartInstance = new Chart(ctx, {
        //     type: "line",
        //     data: {
        //         labels: labels,
        //         datasets: [{
        //             label: "7-Day Moving Avg ($)",
        //             data: averages,
        //             borderColor: "#084298",
        //             tension: 0.1
        //             // borderColor: "#0F766E",
        //             // backgroundColor: "rgba(15, 118, 110, 0.12)",
        //             // fill: true,
        //             // pointBackgroundColor: "#115E59",
        //             // tension: 0.3
        //         }]
        //     }
        // });

        // chartMessage.textContent = "";
        // // 3. Setup Moving Average Chart Search
        // const chartInput = document.getElementById("chart-freelancer-id");
        // const chartBtn = document.getElementById("btn-fetch-chart");
        
        // if (revenueChartInstance) {
        //     revenueChartInstance.destroy();
        //     revenueChartInstance = null;
        // }
        
        // chartMessage.textContent = "Enter a Freelancer ID and click View to load chart.";

        // // Bind the button to fetch data only when clicked
        // chartBtn.onclick = async () => {
        //     const fId = chartInput.value.trim();
        //     if (!fId) return;
            
        //     chartMessage.textContent = "Loading chart data...";
        //     chartBtn.disabled = true;
            
        //     try {
        //         // Pass the freelancer ID to our new backend route
        //         const movingRes = await fetch(`http://localhost:3000/api/analytics/moving-average?freelancer_id=${fId}`);
        //         if (!movingRes.ok) throw new Error("Failed to fetch chart data");
                
        //         const movingData = await movingRes.json();
                
        //         if (!movingData.data || movingData.data.length === 0) {
        //             chartMessage.textContent = "No data found for this freelancer.";
        //             if (revenueChartInstance) revenueChartInstance.destroy();
        //             chartBtn.disabled = false;
        //             return;
        //         }
                
        //         chartMessage.textContent = "";
        //         const labels = movingData.data.map(d => new Date(d.revenue_date).toLocaleDateString());
        //         const averages = movingData.data.map(d => parseFloat(d.moving_avg_7day));
        //         const freelancerName = movingData.data[0].freelancer_name;

        //         if (revenueChartInstance) revenueChartInstance.destroy();
                
        //         const ctx = chartCanvas.getContext("2d");
        //         revenueChartInstance = new Chart(ctx, {
        //             type: "line",
        //             data: {
        //                 labels: labels,
        //                 datasets: [{
        //                     label: `7-Day Moving Avg ($) - ${freelancerName}`,
        //                     data: averages,
        //                     borderColor: "#084298",
        //                     tension: 0.1
        //                 }]
        //             }
        //         });
        //     } catch (err) {
        //         chartMessage.textContent = "Error loading chart. Please check the ID.";
        //     } finally {
        //         chartBtn.disabled = false;
        //     }
        // };
        // 3. Setup Chart: Whole Platform + Dropdown + Search
        const chartSelect = document.getElementById("chart-freelancer-select");
        const chartSearchInput = document.getElementById("chart-search-input");
        const chartSearchBtn = document.getElementById("btn-chart-search");
        
        // Build the dropdown: Whole Platform + Top Earners
        let dropdownHtml = `<option value="all">🌟 Whole Platform</option>`;
        if (rankData.data && rankData.data.length > 0) {
            dropdownHtml += `<optgroup label="Top Earners">`;
            dropdownHtml += rankData.data.map(f => 
                `<option value="${f.freelancer_id}">#${f.revenue_rank} - ${f.freelancer_name}</option>`
            ).join("");
            dropdownHtml += `</optgroup>`;
        }
        chartSelect.innerHTML = dropdownHtml;

        const fetchAndRenderChart = async (fId) => {
            chartMessage.textContent = "Loading chart data...";
            chartSelect.disabled = true;
            chartSearchBtn.disabled = true;
            
            try {
                const movingRes = await fetch(`http://localhost:3000/api/analytics/moving-average?freelancer_id=${fId}`);
                if (!movingRes.ok) throw new Error("Failed to fetch chart data");
                
                const movingData = await movingRes.json();
                chartMessage.textContent = "";

                if (revenueChartInstance) {
                    revenueChartInstance.destroy();
                }

                if (!movingData.data || movingData.data.length === 0) {
                    chartMessage.textContent = "No data found.";
                    return;
                }
                
                const labels = movingData.data.map(d => new Date(d.revenue_date).toLocaleDateString());
                const averages = movingData.data.map(d => parseFloat(d.moving_avg_7day));
                const labelName = movingData.data[0].freelancer_name || "Whole Platform";

                const ctx = chartCanvas.getContext("2d");
                revenueChartInstance = new Chart(ctx, {
                    type: "line",
                    data: {
                        labels: labels,
                        datasets: [{
                            label: `7-Day Moving Avg ($) - ${labelName}`,
                            data: averages,
                            borderColor: "#084298",
                            tension: 0.1
                        }]
                    }
                });
            } catch (err) {
                chartMessage.textContent = "Error loading chart.";
            } finally {
                chartSelect.disabled = false;
                chartSearchBtn.disabled = false;
            }
        };

        // Default Load: Whole Platform
        fetchAndRenderChart('all');

        // Dropdown Change Event
        chartSelect.onchange = (e) => {
            chartSearchInput.value = ""; // Clear search box when using dropdown
            fetchAndRenderChart(e.target.value);
        };

        // Manual Search Event
        chartSearchBtn.onclick = () => {
            const searchId = chartSearchInput.value.trim();
            if (!searchId) return;

            // Check if this ID is already in the dropdown
            let exists = Array.from(chartSelect.options).some(opt => String(opt.value) === searchId);
            
            // If it's a new ID, add it to the dropdown so it stays selected
            if (!exists) {
                const newOption = document.createElement("option");
                newOption.value = searchId;
                // Show a shortened version of the UUID in the dropdown
                newOption.text = `🔍 ID: ${searchId.substring(0, 8)}...`;
                chartSelect.appendChild(newOption);
            }
            
            chartSelect.value = searchId;
            fetchAndRenderChart(searchId);
        };
    } catch (error) {
        console.error("Analytics failed to load:", error);

        const errorMessage = `Unable to load analytics. ${error.message}`;

        if (summaryData.textContent.includes("Loading")) {
            summaryData.textContent = errorMessage;
        }

        if (rankingData.textContent.includes("Loading")) {
            rankingData.textContent = errorMessage;
        }

        if (chartMessage.textContent.includes("Loading")) {
            chartMessage.textContent = errorMessage;
        }
    }
}

// --- Day 3: Map Logic ---

const mapContainer = document.getElementById("map-container");
let mapInstance = null;
let mapMarkers = [];

document.getElementById("btn-map").addEventListener("click", () => {
    document.getElementById("page-title").textContent = "Nearby Workers";
    dataContainer.innerHTML = "";
    document.getElementById("pagination-container").style.display = 'none';
    document.getElementById("search-input").style.display = 'none';
    
    document.getElementById("transaction-container").style.display = 'none';
    document.getElementById("audit-container").style.display = 'none';
    document.getElementById("analytics-container").style.display = 'none';
    document.getElementById("reviews-container").style.display = 'none';
    document.getElementById("search-container").style.display = 'none';
    listHeading.style.display = "none";
    
    mapContainer.style.display = 'block';

    if (!mapInstance) {
        mapInstance = L.map('leaflet-map').setView([13.0827, 80.2707], 12);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles © Esri'
        }).addTo(mapInstance);
    }
    
    setTimeout(() => mapInstance.invalidateSize(), 100);
});


document.getElementById("btn-search-map").addEventListener("click", async () => {
    const lat = document.getElementById("map-lat").value.trim();
    const lng = document.getElementById("map-lng").value.trim();
    const resultsDiv = document.getElementById("map-results");
    const searchButton = document.getElementById("btn-search-map");

    // Validate coordinates
    if (
        lat === "" || lng === "" ||
        !Number.isFinite(Number(lat)) ||
        !Number.isFinite(Number(lng)) ||
        Number(lat) < -90 || Number(lat) > 90 ||
        Number(lng) < -180 || Number(lng) > 180
    ) {
        resultsDiv.textContent =
            "Please enter valid latitude (-90 to 90) and longitude (-180 to 180).";
        return;
    }

    resultsDiv.textContent = "Searching for nearby workers...";
    searchButton.disabled = true;

    try {
        const response = await fetch(
            `http://localhost:3000/api/workers/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
        );

        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
        }

        const result = await response.json();

        // Clear existing markers
        mapMarkers.forEach(m => mapInstance.removeLayer(m));
        mapMarkers = [];

        // Center map and mark the job site
        mapInstance.setView([Number(lat), Number(lng)], 13);

        const originMarker = L.circleMarker(
            [Number(lat), Number(lng)],
            { color: "red", radius: 8 }
        ).addTo(mapInstance).bindPopup("Job Site");

        mapMarkers.push(originMarker);

        if (!result.data || result.data.length === 0) {
            resultsDiv.textContent = "No available workers found within 5km.";
            return;
        }

        let html = `<strong>Found ${result.data.length} workers</strong><br><br>`;

        result.data.forEach(worker => {
            const wLat = worker.location.coordinates[1];
            const wLng = worker.location.coordinates[0];
            const distance = Math.round(worker.distanceMeters);

            html += `
                <div style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 5px;">
                    <strong>Worker ID:</strong> ${worker.worker_id}<br>
                    <strong>Distance:</strong> ${distance} meters
                </div>
            `;

            const marker = L.marker([wLat, wLng])
                .addTo(mapInstance)
                .bindPopup(`Worker ${worker.worker_id}<br>${distance}m away`);

            mapMarkers.push(marker);
        });

        resultsDiv.innerHTML = html;

    } catch (error) {
        resultsDiv.textContent =
            `Unable to search for nearby workers. ${error.message}`;

        const retryButton = document.createElement("button");
        retryButton.textContent = "Retry";
        retryButton.addEventListener("click", () => {
            searchButton.click();
        });

        resultsDiv.appendChild(document.createElement("br"));
        resultsDiv.appendChild(retryButton);

    } finally {
        searchButton.disabled = false;
    }
});


// --- Day 3: Reviews & Portfolios Logic ---

const reviewsContainer = document.getElementById("reviews-container");
let ratingChartInstance = null;
let skillsChartInstance = null;

document.getElementById("btn-reviews").addEventListener("click", () => {
    document.getElementById("page-title").textContent = "Reviews & Portfolios";
    dataContainer.innerHTML = "";
    document.getElementById("pagination-container").style.display = 'none';
    document.getElementById("search-input").style.display = 'none';
    
    document.getElementById("transaction-container").style.display = 'none';
    document.getElementById("audit-container").style.display = 'none';
    document.getElementById("analytics-container").style.display = 'none';
    document.getElementById("map-container").style.display = 'none';
    document.getElementById("search-container").style.display = 'none';
    listHeading.style.display = "none";
    
    reviewsContainer.style.display = 'block';
    loadReviewsAnalytics();
});


async function loadReviewsAnalytics() {
    const avgRating = document.getElementById("avg-rating");
    const ratingCanvas = document.getElementById("ratingChart");
    const skillsCanvas = document.getElementById("skillsChart");

    avgRating.textContent = "Loading review analytics...";

    try {
        const response = await fetch(
            "http://localhost:3000/api/reviews/analytics"
        );

        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
        }

        const data = await response.json();

        // 1. Overall Average Rating
        const avg = Number(
            data.overall_average_rating?.[0]?.average_rating ?? 0
        );

        avgRating.textContent = `Overall Average: ${avg.toFixed(2)} ⭐`;

        // 2. Rating Distribution Bar Chart
        const ratingDistribution = data.rating_distribution || [];
        const ratingLabels = ratingDistribution.map(d => `${d._id} Star`);
        const ratingCounts = ratingDistribution.map(d => d.count);

        if (ratingChartInstance) {
            ratingChartInstance.destroy();
            ratingChartInstance = null;
        }

        if (ratingLabels.length === 0) {
            ratingCanvas.style.display = "none";
            showChartMessage(ratingCanvas, "No rating distribution data available.");
        } else {
            ratingCanvas.style.display = "block";
            removeChartMessage(ratingCanvas);

            ratingChartInstance = new Chart(ratingCanvas, {
                type: "bar",
                data: {
                    labels: ratingLabels,
                    datasets: [{
                        label: "Number of Reviews",
                        data: ratingCounts,
                        backgroundColor: "#0284C7"
                        // backgroundColor: "#5BBFA5",
                        // borderColor: "#0F766E",
                        // borderWidth: 1
                    }]
                }
            });
        }

        // 3. Top Skills Pie Chart
        const skillFrequency = data.skill_tag_frequency || [];
        const skillLabels = skillFrequency.map(d => d._id);
        const skillCounts = skillFrequency.map(d => d.count);

        if (skillsChartInstance) {
            skillsChartInstance.destroy();
            skillsChartInstance = null;
        }

        if (skillLabels.length === 0) {
            skillsCanvas.style.display = "none";
            showChartMessage(skillsCanvas, "No skill-tag data available.");
        } else {
            skillsCanvas.style.display = "block";
            removeChartMessage(skillsCanvas);

            skillsChartInstance = new Chart(skillsCanvas, {
                type: "pie",
                data: {
                    labels: skillLabels,
                    datasets: [{
                        data: skillCounts,
                        backgroundColor: [
                            "#BAE6FD", "#7DD3FC", "#38BDF8", "#0EA5E9",
                            "#0284C7", "#0369A1", "#075985", "#0C4A6E",
                            "#082F49", "#041E30"
                        ]
                        // backgroundColor: [
                        //     "#0d6efd", "#6610f2", "#6f42c1", "#d63384",
                        //     "#dc3545", "#fd7e14", "#198754", "#20c997",
                        //     "#0dcaf0", "#adb5bd"
                        // ]
                        // backgroundColor: [
                        //     "#0F766E",
                        //     "#2A9D8F",
                        //     "#5BBFA5",
                        //     "#8DDCC3",
                        //     "#B7EDE0",
                        //     "#115E59",
                        //     "#78B7A8",
                        //     "#A7CFC3",
                        //     "#3D8B80",
                        //     "#D1FAE5"
                        // ]
                    }]
                }
            });
        }
        // 4. Fetch Individual Reviews
        const reviewsList = document.getElementById("reviews-list-results");
        reviewsList.innerHTML = "<p>Loading recent reviews...</p>";
        
        try {
            const reviewsRes = await fetch("http://localhost:3000/api/reviews");
            const reviewsData = await reviewsRes.json();
            
            // Log the response to the browser console for debugging
            console.log("Reviews API Response:", reviewsData);
            
            // Extract the array whether it is wrapped in .data or sent directly
            const actualReviews = Array.isArray(reviewsData) ? reviewsData : reviewsData.data;
            
            if (!actualReviews || actualReviews.length === 0) {
                reviewsList.innerHTML = "<p>No reviews have been posted yet.</p>";
            } else {
                let reviewsHtml = "";
                actualReviews.forEach(review => {
                    const stars = '⭐'.repeat(Math.round(review.rating || 0));
                    
                    reviewsHtml += `
                        <div class="card" style="border: 1px solid #dee2e6; background-color: #f8f9fa;">
                            <h5 style="margin: 0 0 10px 0; color: #0369a1;">Rating: ${stars}</h5>
                            <p style="margin: 5px 0;"><strong>Freelancer ID:</strong> ${review.freelancer_id}</p>
                            <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(review.created_at).toLocaleDateString()}</p>
                            <p style="margin: 10px 0;"><strong>Skills Tagged:</strong> ${review.skill_tags ? review.skill_tags.join(', ') : 'None'}</p>
                        </div>
                    `;
                });
                reviewsList.innerHTML = reviewsHtml;
            }
        } catch (reviewErr) {
            reviewsList.innerHTML = `<p style="color:red;">Failed to load reviews list: ${reviewErr.message}</p>`;
        }

    } catch (error) {
        console.error("Failed to load reviews:", error);

        avgRating.textContent =
            `Unable to load review analytics. ${error.message}`;

        [ratingCanvas, skillsCanvas].forEach(canvas => {
            if (ratingChartInstance && canvas === ratingCanvas) {
                ratingChartInstance.destroy();
                ratingChartInstance = null;
            }

            if (skillsChartInstance && canvas === skillsCanvas) {
                skillsChartInstance.destroy();
                skillsChartInstance = null;
            }

            canvas.style.display = "none";
            showChartMessage(canvas, "Review chart unavailable because the data failed to load.");
        });
    }
}

// Helper functions for chart messages
function showChartMessage(canvas, message) {
    removeChartMessage(canvas);

    const paragraph = document.createElement("p");
    paragraph.className = "chart-message";
    paragraph.textContent = message;

    canvas.insertAdjacentElement("afterend", paragraph);
}

function removeChartMessage(canvas) {
    const next = canvas.nextElementSibling;

    if (next && next.classList.contains("chart-message")) {
        next.remove();
    }
}

document.getElementById("btn-search-portfolio").addEventListener("click", async () => {
    const fId = document.getElementById("portfolio-id").value.trim();
    const resultsDiv = document.getElementById("portfolio-results");
    
    if (!fId) return;
    
    resultsDiv.innerHTML = "Searching...";
    try {
        const response = await fetch(`http://localhost:3000/api/portfolios/${fId}`);
        const result = await response.json();
        
        if (!result.data || result.data.length === 0) {
            resultsDiv.innerHTML = "<p>No portfolio found for this ID.</p>";
            return;
        }
        
        const portfolio = result.data[0];
        
        let html = `
            <div class="card" style="border: 1px solid #dee2e6; margin-top: 10px; background-color: #f8f9fa;">
                <h5 style="margin-top: 0; color: #0369a1;">Freelancer ID: ${portfolio.freelancer_id}</h5>
                <p><small style="color: gray;">MongoDB _id: ${portfolio._id}</small></p>
                
                <div style="margin-top: 10px;">
                    <strong>Skills:</strong>
                    <ul style="margin-top: 5px; margin-bottom: 10px;">
                        ${portfolio.skills.map(skill => `<li>${skill}</li>`).join('')}
                    </ul>
                </div>
                
                <div>
                    <strong>Certifications:</strong>
                    <ul style="margin-top: 5px; margin-bottom: 0;">
                        ${portfolio.certifications.map(cert => `<li>${cert}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
        resultsDiv.innerHTML = html;
    } catch (error) {
        resultsDiv.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`;
    }
});