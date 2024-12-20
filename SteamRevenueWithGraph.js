// ==UserScript==
// @name         Steam Revenue v2 with Graph (Final Version)
// @icon         https://www.google.com/s2/favicons?sz=64&domain=steampowered.com
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Calculate Steam game revenue and display a graph of player data below the calculations.
// @match        https://store.steampowered.com/app/*
// @connect      steamcharts.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/chart.js
// @require      https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns
// @updateURL    https://raw.githubusercontent.com/hex512/Steam_Revenue_With_Graph/main/SteamRevenueWithGraph.js
// @downloadURL  https://raw.githubusercontent.com/hex512/Steam_Revenue_With_Graph/main/SteamRevenueWithGraph.js
// ==/UserScript==

(function () {
    'use strict';

    const MAGIC_VALUE = 60;
    const AVG_PRICE_MODIFIER = 0.75;
    const STEAM_CUT = 0.30;
    const debug = true;
    const ARTIFICIAL_DELAY = 1000;

    // Добавляем стили для таблицы и графика
    GM_addStyle(`
        #chartContainer {
            margin-top: 5px;
            max-width: 940px;
            background: rgb(34, 34, 34);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 1px;
            padding: 5px;
            overflow: hidden;
        }
        #chartContainer canvas {
            display: block;
            width: 920px;
            max-width: 100%;
            height: 400px;
            margin: 0 auto;
        }
        #zoomButtons {
            display: flex;
            justify-content: start;
            gap: 3px;
            margin-bottom: 3px;
        }
        .zoom-button {
            background: rgba(30, 30, 30, 1);
            color: #e8e8e8;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 1px;
            cursor: pointer;
            padding: 5px 10px;
            font-size: 13px;
        }
        .zoom-button.active {
            background: #00AEEF;
            color: white;
        }
    `);

    // Показываем индикатор загрузки
    function showSpinner(container) {
        const spinner = document.createElement("div");
        spinner.id = "revenue-spinner";
        spinner.style.textAlign = "center";
        spinner.style.color = "#FFF";
        spinner.style.padding = "10px";
        spinner.style.marginTop = "10px";
        spinner.style.fontSize = "16px";
        spinner.style.border = "1px solid #444";
        spinner.style.background = "#222";
        spinner.style.borderRadius = "5px";
        spinner.style.minHeight = "136px";
        spinner.style.display = "flex";
        spinner.style.justifyContent = "center";
        spinner.style.alignItems = "center";
        spinner.innerHTML = `🔄 Preparing data...`;
        container.appendChild(spinner);
    }

    function removeSpinner() {
        const spinner = document.getElementById("revenue-spinner");
        if (spinner) spinner.remove();
    }

    function parsePrice(priceString) {
        if (!priceString) return null;
        try {
            return parseFloat(priceString.replace(/[^0-9.]/g, '')) * AVG_PRICE_MODIFIER;
        } catch (error) {
            debug && console.error("Error parsing price:", error);
            return null;
        }
    }

    function findOriginalPrice() {
        try {
            const purchaseBlock = document.querySelector('div#game_area_purchase');
            if (!purchaseBlock) return null;

            const originalPriceEl = purchaseBlock.querySelector('.discount_original_price');
            if (originalPriceEl) return parsePrice(originalPriceEl.innerText);

            const regularPriceEl = purchaseBlock.querySelector('.game_purchase_price.price');
            if (regularPriceEl) return parsePrice(regularPriceEl.innerText);

            return null;
        } catch (error) {
            debug && console.error("Error finding price:", error);
            return null;
        }
    }

    function calculateProfit(price, reviewsCount) {
        const gross = reviewsCount * MAGIC_VALUE * price;
        return {
            gross,
            net: gross * (1 - STEAM_CUT),
            cut: gross * STEAM_CUT
        };
    }

    function injectProfitData(profit, price, reviewsCount, container) {
        const formatter = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        const table = document.createElement("table");
        table.style.width = "100%";
        table.style.marginTop = "10px";
        table.style.borderCollapse = "collapse";
        table.style.background = "#222";
        table.style.color = "#FFF";
        table.style.border = "1px solid #444";
        table.style.textAlign = "left";
        table.style.fontSize = "14px";
        table.style.borderRadius = "5px";

        table.innerHTML = `
            <tbody>
                <tr><td style="padding: 5px; border: 1px solid #444;">Обзоров:</td><td style="padding: 5px; border: 1px solid #444;">${reviewsCount.toLocaleString()}</td></tr>
                <tr><td style="padding: 5px; border: 1px solid #444;">Цена (без скидки):</td><td style="padding: 5px; border: 1px solid #444;">${formatter.format(price)}</td></tr>
                <tr><td style="padding: 5px; border: 1px solid #444;">Валовой доход:</td><td style="padding: 5px; border: 1px solid #444;">${formatter.format(profit.gross)}</td></tr>
                <tr><td style="padding: 5px; border: 1px solid #444;">Steam забрал:</td><td style="padding: 5px; border: 1px solid #444;">${formatter.format(profit.cut)}</td></tr>
                <tr><td style="padding: 5px; border: 1px solid #444;">Чистая прибыль:</td><td style="padding: 5px; border: 1px solid #444;">${formatter.format(profit.net)}</td></tr>
            </tbody>
        `;

        container.appendChild(table);
    }

    // Список интервалов (в миллисекундах)
    const timeRanges = {
        "48h": 48 * 60 * 60 * 1000,
        "1w": 7 * 24 * 60 * 60 * 1000,
        "1m": 30 * 24 * 60 * 60 * 1000,
        "3m": 90 * 24 * 60 * 60 * 1000,
        "6m": 180 * 24 * 60 * 60 * 1000,
        "1y": 365 * 24 * 60 * 60 * 1000,
        "3y": 3 * 365 * 24 * 60 * 60 * 1000,
        "6y": 6 * 365 * 24 * 60 * 60 * 1000,
        "9y": 9 * 365 * 24 * 60 * 60 * 1000,
        "max": Infinity
    };

    // Функция загрузки и отображения графика
    async function loadGraph(appId) {
        const apiUrl = `https://steamcharts.com/app/${appId}/chart-data.json`;
        const imgContainerEl = document.getElementById("game_highlights");
        if (!imgContainerEl || document.getElementById("chartContainer")) {
            console.error("Контейнер для графика не найден или график уже загружен.");
            return;
        }

        GM_xmlhttpRequest({
            method: "GET",
            url: apiUrl,
            onload: function (response) {
                if (response.status !== 200) {
                    console.error(`Ошибка загрузки данных: ${response.status}`);
                    return;
                }

                const data = JSON.parse(response.responseText);
                const timestamps = data.map(item => new Date(item[0]));
                const playerCounts = data.map(item => item[1]);

                // Создание контейнера для графика
                const chartContainer = document.createElement("div");
                chartContainer.id = "chartContainer";

                // Кнопки масштабирования
                const zoomButtons = document.createElement("div");
                zoomButtons.id = "zoomButtons";
                Object.keys(timeRanges).forEach(range => {
                    const button = document.createElement("button");
                    button.className = "zoom-button";
                    button.innerText = range;
                    button.addEventListener("click", () => updateChart(range));
                    zoomButtons.appendChild(button);
                });
                chartContainer.appendChild(zoomButtons);

                // Элемент Canvas для графика
                const canvas = document.createElement("canvas");
                chartContainer.appendChild(canvas);
                imgContainerEl.appendChild(chartContainer);

                // Построение графика с Chart.js
                const ctx = canvas.getContext("2d");
                const gradient = ctx.createLinearGradient(0, 0, 0, 400);
                gradient.addColorStop(0, "rgba(75, 192, 192, 0.5)");
                gradient.addColorStop(1, "rgba(75, 192, 192, 0)");

                const chart = new Chart(ctx, {
                    type: "line",
                    data: {
                        labels: timestamps,
                        datasets: [{
                            label: "Players Online",
                            data: playerCounts,
                            borderColor: "rgba(75, 192, 192, 1)",
                            backgroundColor: gradient,
                            borderWidth: 2,
                            pointRadius: 0,
                            fill: true,
                            tension: 0.4 // Плавная линия
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                labels: {
                                    color: "#FFF",
                                    font: {
                                        size: 14
                                    }
                                }
                            },
                            tooltip: {
                                enabled: true,
                                intersect: false,
                                mode: "index",
                                callbacks: {
                                    label: (context) => `Players: ${context.raw.toLocaleString()}`
                                }
                            }
                        },
                        interaction: {
                            intersect: false,
                            mode: "index"
                        },
                        scales: {
                            x: {
                                type: "time",
                                time: {
                                    unit: "day"
                                },
                                ticks: {
                                    color: "#FFF",
                                    maxTicksLimit: 10
                                },
                                grid: {
                                    color: "rgba(255, 255, 255, 0.1)"
                                }
                            },
                            y: {
                                ticks: {
                                    color: "#FFF",
                                    callback: (value) => value.toLocaleString() // Форматируем числа
                                },
                                grid: {
                                    color: "rgba(255, 255, 255, 0.1)"
                                }
                            }
                        },
                        layout: {
                            padding: {
                                left: 10,
                                right: 10,
                                top: 20,
                                bottom: 10
                            }
                        }
                    }
                });

                // Функция обновления графика по кнопке
                function updateChart(range) {
                    const rangeMs = timeRanges[range];
                    const now = new Date().getTime();
                    const filteredData = data.filter(item => now - item[0] <= rangeMs);

                    // Обновляем данные
                    chart.data.labels = filteredData.map(item => new Date(item[0]));
                    chart.data.datasets[0].data = filteredData.map(item => item[1]);

                    // Обновляем кнопки
                    document.querySelectorAll(".zoom-button").forEach(btn => btn.classList.remove("active"));
                    const activeButton = Array.from(document.querySelectorAll(".zoom-button"))
                        .find(btn => btn.innerText === range);
                    if (activeButton) activeButton.classList.add("active");

                    chart.update();
                }

                // Устанавливаем "1w" по умолчанию
                updateChart("1w");
            },
            onerror: function (error) {
                console.error("Ошибка при загрузке данных:", error);
            }
        });
    }

    function loadRevenueData(container) {
        const appIdMatch = window.location.href.match(/\/app\/(\d+)/); // Исправлено регулярное выражение
        if (!appIdMatch) {
            debug && console.error("AppID не найден.");
            removeSpinner();
            return;
        }

        const appId = appIdMatch[1];
        const price = findOriginalPrice();
        const reviewsCountMeta = document.querySelector('meta[itemprop="reviewCount"]');
        if (!reviewsCountMeta) {
            removeSpinner();
            return;
        }

        const reviewsCount = Number(reviewsCountMeta.getAttribute("content"));
        if (price && reviewsCount) {
            const profit = calculateProfit(price, reviewsCount);
            setTimeout(() => {
                removeSpinner();
                injectProfitData(profit, price, reviewsCount, container);
                loadGraph(appId);
            }, ARTIFICIAL_DELAY);
        } else if(reviewsCount){
            setTimeout(() => {
                removeSpinner();
                loadGraph(appId);
            }, ARTIFICIAL_DELAY);
        }
        else{
            removeSpinner();
        }
    }

    const observer = new MutationObserver(() => {
        const imgContainerEl = document.getElementById("game_highlights");
        if (imgContainerEl && !document.getElementById("revenue-spinner")) {
            observer.disconnect();
            showSpinner(imgContainerEl);
            loadRevenueData(imgContainerEl);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
