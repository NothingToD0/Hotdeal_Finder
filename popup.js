document.addEventListener("DOMContentLoaded", async () => {
    const resultsContainer = document.getElementById("results");
    const productNameElement = document.getElementById("product-name");
    const loadingMessage = document.getElementById("loading");
    const refreshButton = document.getElementById("refresh-button");

    const fetchDeals = async () => {
        loadingMessage.style.display = "block";
        resultsContainer.innerHTML = "";

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (tab.url.includes("coupang.com/vp/products")) {
                chrome.scripting.executeScript(
                    {
                        target: { tabId: tab.id },
                        func: () => document.querySelector('.prod-buy-header__title')?.textContent.trim(),
                    },
                    async ([result]) => {
                        const productTitle = result.result;

                        if (productTitle) {
                            productNameElement.textContent = productTitle;

                            const response = await chrome.runtime.sendMessage({
                                action: "searchDeals",
                                query: productTitle,
                            });

                            if (response.deals.length > 0) {
                                // [필독] 제거
                                const filteredDeals = response.deals.filter(
                                    (deal) => !deal.title.includes("[필독]")
                                );

                                resultsContainer.innerHTML = filteredDeals.length
                                    ? filteredDeals
                                          .map(
                                              (deal) => `
                                    <div class="hotdeal-item">
                                        <a href="${deal.url}" target="_blank">${deal.title}</a>
                                        <button onclick="window.open('${deal.url}', '_blank')" style="background: #007bff; color: white; border: none; border-radius: 5px; padding: 5px 10px; cursor: pointer;">View</button>
                                    </div>
                                `
                                          )
                                          .join("")
                                    : '<p class="no-results">검색 결과가 없습니다.</p>';
                            } else {
                                resultsContainer.innerHTML = '<p class="no-results">검색 결과가 없습니다.</p>';
                            }
                        } else {
                            productNameElement.textContent = "상품 제목을 찾을 수 없습니다.";
                        }
                    }
                );
            } else {
                productNameElement.textContent = "쿠팡 상품 페이지가 아닙니다.";
                resultsContainer.innerHTML = "";
            }
        } catch (error) {
            console.error("Error in popup.js:", error);
            resultsContainer.innerHTML = `<p class="no-results">오류가 발생했습니다: ${error.message}</p>`;
        } finally {
            loadingMessage.style.display = "none";
        }
    };

    refreshButton.addEventListener("click", fetchDeals);

    fetchDeals(); // 초기 검색 실행
});
