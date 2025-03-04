chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "searchDeals") {
        fetchHotDeals(message.query).then((deals) => {
            console.log("핫딜 검색 결과:", deals);
            sendResponse({ deals });
        }).catch((error) => {
            console.error("핫딜 검색 오류:", error);
            sendResponse({ deals: [] });
        });

        return true; // 비동기 작업이 완료될 때까지 메시지 채널 유지
    }
});

// 핫딜 게시판 데이터를 가져오는 함수
async function fetchHotDeals(query) {
    const sites = [
        { url: "https://bbs.ruliweb.com/market/board/1020?page=", pages: 2 },
        { url: "https://www.ppomppu.co.kr/zboard/zboard.php?id=ppomppu&page=", pages: 2 },
        { url: "https://arca.live/b/hotdeal?p=", pages: 2 },
        { url: "https://quasarzone.com/bbs/qb_saleinfo?page=", pages:  4},
        { url: "https://www.algumon.com/", pages: 1 } // 알구몬은 단일 페이지
    ];

    const deals = [];

    for (const site of sites) {
        for (let i = 1; i <= site.pages; i++) {
            try {
                // 알구몬은 page 파라미터가 필요 없으므로 URL 그대로 사용
                const targetUrl = site.url.includes("algumon") ? site.url : `${site.url}${i}`;
                const response = await fetch(targetUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                        "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
                        "Cache-Control": "no-cache"
                    }
                });

                if (!response.ok) {
                    console.error(`Failed to fetch ${targetUrl}: ${response.statusText}`);
                    continue;
                }

                // 헤더에서 Content-Type 확인
                const contentType = response.headers.get('content-type');
                const buffer = await response.arrayBuffer(); // 바이너리 데이터로 읽기

                let html;
                if (contentType && contentType.includes('charset=euc-kr')) {
                    // EUC-KR 디코딩
                    const decoder = new TextDecoder('euc-kr');
                    html = decoder.decode(buffer);
                } else {
                    // 기본 UTF-8 처리
                    const decoder = new TextDecoder('utf-8');
                    html = decoder.decode(buffer);
                }

                // 추출한 HTML 로그 출력
                console.log(`HTML fetched from ${targetUrl}:
`, html.substring(0, 5000)); // 5000자까지 출력

                const siteDeals = extractDealsFromHTML(html, targetUrl);
                console.log(`Deals collected from ${targetUrl}:`, siteDeals);

                deals.push(...siteDeals);
            } catch (error) {
                console.error(`Error fetching from ${site.url}${i}:`, error);
            }
        }
    }

    console.log("Total deals before deduplication:", deals.length);
    const uniqueDeals = removeDuplicates(deals);
    console.log("Total deals after deduplication:", uniqueDeals.length);

    return rankDeals(query, uniqueDeals);
}

// 각 사이트에서 핫딜 데이터를 추출하는 함수
function extractDealsFromHTML(html, siteUrl) {
    const deals = [];

    // HTML에서 특정 태그를 찾아 텍스트를 추출
    const extractTextBetweenTags = (html, tag, attribute = null, value = null) => {
        const regexString = attribute
            ? `<${tag}[^>]*${attribute}="${value}"[^>]*>(.*?)<\/${tag}>`
            : `<${tag}[^>]*>(.*?)<\/${tag}>`;
        const regex = new RegExp(regexString, "gi");
        const matches = [];
        let match;
        while ((match = regex.exec(html)) !== null) {
            matches.push(match[1].trim());
        }
        return matches;
    };

    if (siteUrl.includes("ruliweb")) {
        const titles = extractTextBetweenTags(html, "td", "class", "subject");
        const links = extractTextBetweenTags(html, "a", "class", "subject_link deco");
        titles.forEach((title, index) => {
            deals.push({ title, url: `https://bbs.ruliweb.com${links[index]}` });
        });
    } else if (siteUrl.includes("ppomppu")) {
        const titles = extractTextBetweenTags(html, "a", "class", "baseList-title");
        const links = extractTextBetweenTags(html, "a", "class", "baseList-title");
        titles.forEach((title, index) => {
            deals.push({ title, url: `https://www.ppomppu.co.kr${links[index]}` });
        });
    } else if (siteUrl.includes("arca")) {
        const titles = extractTextBetweenTags(html, "a", "class", "title hybrid-title");
        const links = extractTextBetweenTags(html, "a", "class", "title hybrid-title");
        titles.forEach((title, index) => {
            deals.push({ title, url: `https://arca.live${links[index]}` });
        });
    } else if (siteUrl.includes("quasarzone")) {
        const titles = extractTextBetweenTags(html, "span", "class", "ellipsis-with-reply-cnt");
        const lines = html.split("\n");
        const links = [];
    
        // 제목 위에서 5줄 탐색
        titles.forEach(title => {
            const index = lines.findIndex(line => line.includes(title));
            if (index > -1) {
                for (let i = index - 1; i >= index - 5; i--) {
                    if (i >= 0 && lines[i].includes("<a ") && lines[i].includes("href=\"")) {
                        const match = lines[i].match(/href=\"([^\"]+)\"/);
                        if (match) {
                            links.push(match[1]);
                            break;
                        }
                    }
                }
            }
        });
    
        titles.forEach((title, index) => {
            if (links[index]) {
                deals.push({ title, url: `https://quasarzone.com${links[index]}` });
            }
        });
    } else if (siteUrl.includes("algumon")) {
        const titles = extractTextBetweenTags(html, "a", "class", "product-link");
        const links = extractTextBetweenTags(html, "a", "class", "product-link");
        titles.forEach((title, index) => {
            deals.push({ title, url: `https://www.algumon.com${links[index]}` });
        });
    }

    return deals;
}

// 유사도 계산 및 정렬
function rankDeals(query, deals) {
    return deals
        .map(deal => ({
            ...deal,
            similarity: calculateSimilarity(query, deal.title)
        }))
        .sort((a, b) => b.similarity - a.similarity);
}

// 한글에 맞춘 유사도 계산
function calculateSimilarity(query, title) {
    const queryLower = query.toLowerCase();
    const titleLower = title.toLowerCase();

    // 완전 매칭: 제목에 검색어 전체가 포함되면 높은 점수 부여
    if (titleLower.includes(queryLower)) return 10;

    // 초성 매칭: 초성을 추출하여 비교
    const extractInitials = (text) => text
        .split('')
        .map(char => char.charCodeAt(0) >= 0xAC00 && char.charCodeAt(0) <= 0xD7A3
            ? String.fromCharCode(((char.charCodeAt(0) - 0xAC00) / 28 / 21) + 0x1100)
            : char)
        .join('');

    const queryInitials = extractInitials(queryLower);
    const titleInitials = extractInitials(titleLower);

    if (titleInitials.includes(queryInitials)) return 8;

    // 단어 매칭: 쿼리와 제목의 공통 단어 개수 계산
    const queryWords = queryLower.split(/\s+/);
    const titleWords = titleLower.split(/\s+/);
    const commonWords = queryWords.filter(word => titleWords.includes(word));
    return commonWords.length;
}

// 중복 제거 함수
function removeDuplicates(deals) {
    const seen = new Set();
    return deals.filter(deal => {
        const identifier = deal.title + deal.url; // 고유 식별자
        if (seen.has(identifier)) {
            return false;
        }
        seen.add(identifier);
        return true;
    });
}
