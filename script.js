// --- 전역 변수 ---
let stockData = [];      // 파싱된 데이터 전체
let currentIndex = 0;    // 현재 시뮬레이션 날짜 인덱스
let timer = null;        // setInterval 타이머
let isPaused = false;
let speed = 50;          // ms 단위 (작을수록 빠름)

// 티커별 데이터 범위 캐시
let tickerDataRanges = {};

// updateTickerDateInfo race condition 방지용 카운터
let tickerInfoUpdateId = 0;

// 커스텀 티커 CSV 데이터 캐시
let customTickerCSV = null;

// --- localStorage 헬퍼 함수 ---
const STORAGE_PREFIX = 'itm_ticker_';
const STORAGE_LIST_KEY = 'itm_saved_tickers';

function getSavedTickerList() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_LIST_KEY)) || [];
    } catch { return []; }
}

function saveTickerToStorage(ticker, csvData) {
    const list = getSavedTickerList();
    const entry = list.find(t => t.symbol === ticker);
    const now = new Date().toISOString().slice(0, 10);
    
    if (entry) {
        entry.updatedAt = now;
    } else {
        list.push({ symbol: ticker, updatedAt: now });
    }
    
    localStorage.setItem(STORAGE_LIST_KEY, JSON.stringify(list));
    localStorage.setItem(STORAGE_PREFIX + ticker, csvData);
}

function loadTickerFromStorage(ticker) {
    return localStorage.getItem(STORAGE_PREFIX + ticker);
}

function deleteTickerFromStorage(ticker) {
    const list = getSavedTickerList().filter(t => t.symbol !== ticker);
    localStorage.setItem(STORAGE_LIST_KEY, JSON.stringify(list));
    localStorage.removeItem(STORAGE_PREFIX + ticker);
}

function getStorageUsage() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        total += localStorage.getItem(key).length * 2; // UTF-16
    }
    return (total / 1024 / 1024).toFixed(2); // MB
}

// 년도별 입금액 설정
let yearlyDeposits = {};

// 주 번호 계산 헬퍼 함수 (년도 + 주차를 고유하게 식별)
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() * 100 + weekNo; // 년도*100 + 주차로 고유값 생성
}

// 역사적 사건 데이터
const historicalEvents = {
    '2000-03-10': '🔴 닷컴버블 정점',
    '2001-09-11': '🔴 9/11 테러',
    '2007-10-09': '🔴 서브프라임 위기 시작',
    '2008-09-15': '🔴 리먼브라더스 파산',
    '2009-03-09': '🟢 금융위기 저점',
    '2010-05-06': '🔴 플래시 크래시',
    '2011-08-05': '🔴 미국 신용등급 강등',
    '2015-08-24': '🔴 중국발 블랙먼데이',
    '2018-12-24': '🔴 2018 크리스마스 폭락',
    '2020-02-19': '🔴 코로나 폭락 시작',
    '2020-03-23': '🟢 코로나 저점',
    '2021-11-19': '🔴 나스닥 고점 (금리인상 시작)',
    '2022-01-03': '🔴 S&P500 고점',
    '2022-06-16': '🟢 2022 중간 저점',
    '2022-10-12': '🟢 2022 저점',
};

// 포트폴리오 상태
let portfolio = {
    cash: 0,
    shares: 0,
    totalInvested: 0,
    totalDividends: 0,
    currentDepositAmount: 0,
    lastDepositMonth: -1,
    lastDepositWeek: -1
};

// 차트 객체
let chartInstance = null;

// UI 엘리먼트 캐싱
const els = {
    setupScreen: document.getElementById('setup-screen'),
    simScreen: document.getElementById('simulation-screen'),
    tickerSelect: document.getElementById('tickerSelect'),
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
    initialDeposit: document.getElementById('initialDeposit'),
    regularDeposit: document.getElementById('regularDeposit'),
    frequency: document.getElementById('frequency'),
    tickerDateInfo: document.getElementById('tickerDateInfo'),
    
    // 년도별 설정 모달
    openYearlySettingBtn: document.getElementById('openYearlySettingBtn'),
    yearlyModal: document.getElementById('yearlyModal'),
    yearlyInputs: document.getElementById('yearlyInputs'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    saveYearlyBtn: document.getElementById('saveYearlyBtn'),
    autoIncreaseRate: document.getElementById('autoIncreaseRate'),
    applyAutoIncreaseBtn: document.getElementById('applyAutoIncreaseBtn'),
    
    // 컨트롤 패널
    jumpDate: document.getElementById('jumpDate'),
    jumpBtn: document.getElementById('jumpBtn'),
    speedInput: document.getElementById('speedInput'),
    applySpeedBtn: document.getElementById('applySpeedBtn'),
    
    // Custom ticker
    customTickerArea: document.getElementById('customTickerArea'),
    customTickerInput: document.getElementById('customTickerInput'),
    fetchTickerBtn: document.getElementById('fetchTickerBtn'),
    csvFileInput: document.getElementById('csvFileInput'),
    csvFileName: document.getElementById('csvFileName'),
    yahooFinanceLink: document.getElementById('yahooFinanceLink'),
    tickerFetchStatus: document.getElementById('tickerFetchStatus'),
    savedTickerActions: document.getElementById('savedTickerActions'),
    savedTickerInfo: document.getElementById('savedTickerInfo'),
    updateTickerBtn: document.getElementById('updateTickerBtn'),
    deleteTickerBtn: document.getElementById('deleteTickerBtn'),
    savedTickerSeparator: document.getElementById('savedTickerSeparator'),
    
    // Sim outputs
    displayTicker: document.getElementById('displayTicker'),
    simDate: document.getElementById('simDate'),
    totalValue: document.getElementById('totalValue'),
    returnRate: document.getElementById('returnRate'),
    totalShares: document.getElementById('totalShares'),
    totalInvested: document.getElementById('totalInvested'),
    totalDividends: document.getElementById('totalDividends'),
    profitLoss: document.getElementById('profitLoss'),
    logList: document.getElementById('logList'),
    
    // Buttons
    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    skipBtn: document.getElementById('skipBtn'),
    resetBtn: document.getElementById('resetBtn')
};

// --- 0. 초기화: 티커 데이터 범위 로드 ---
async function loadTickerDateRange(ticker) {
    try {
        const response = await fetch(`./stock_data/${ticker}.csv`);
        if (!response.ok) return null;
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        
        if (lines.length < 2) return null;
        
        const headers = lines[0].split(',');
        const idxDate = headers.findIndex(h => h.includes('Date'));
        
        const firstRow = lines[1].split(',');
        const lastRow = lines[lines.length - 1].split(',');
        
        return {
            minDate: firstRow[idxDate],
            maxDate: lastRow[idxDate]
        };
    } catch (e) {
        return null;
    }
}

async function updateTickerDateInfo() {
    const ticker = els.tickerSelect.value;
    const myUpdateId = ++tickerInfoUpdateId;
    
    if (ticker === '__custom__') {
        if (tickerDataRanges['__custom__']) {
            const range = tickerDataRanges['__custom__'];
            els.tickerDateInfo.textContent = `📅 데이터 기간: ${range.minDate} ~ ${range.maxDate}`;
        } else {
            els.tickerDateInfo.textContent = '📅 티커를 입력하고 데이터를 받아오세요.';
        }
        return;
    }
    
    // 저장된 티커인 경우
    if (ticker.startsWith('__saved__')) {
        const symbol = ticker.replace('__saved__', '');
        const csv = loadTickerFromStorage(symbol);
        if (csv) {
            const lines = csv.trim().split('\n');
            const headers = lines[0].split(',');
            const idxDate = headers.findIndex(h => h.includes('Date'));
            const firstDate = lines[1].split(',')[idxDate];
            const lastDate = lines[lines.length - 1].split(',')[idxDate];
            els.tickerDateInfo.textContent = `📅 데이터 기간: ${firstDate} ~ ${lastDate}`;
            els.startDate.value = firstDate;
            els.endDate.value = lastDate;
            
            // 저장 정보 표시
            const savedList = getSavedTickerList();
            const entry = savedList.find(t => t.symbol === symbol);
            if (entry) {
                els.savedTickerInfo.textContent = `마지막 업데이트: ${entry.updatedAt}`;
            }
        }
        return;
    }
    
    els.tickerDateInfo.textContent = '📅 데이터 기간: 로딩중...';
    
    if (!tickerDataRanges[ticker]) {
        tickerDataRanges[ticker] = await loadTickerDateRange(ticker);
    }
    
    // Race condition 방지: await 사이에 사용자가 다른 티커를 선택했으면 무시
    if (myUpdateId !== tickerInfoUpdateId) return;
    
    const range = tickerDataRanges[ticker];
    if (range) {
        els.tickerDateInfo.textContent = `📅 데이터 기간: ${range.minDate} ~ ${range.maxDate}`;
        // 시작일/종료일 자동 설정
        els.startDate.value = range.minDate;
        els.endDate.value = range.maxDate;
    } else {
        els.tickerDateInfo.textContent = '📅 데이터를 불러올 수 없습니다.';
    }
}

// --- 저장된 티커 드롭다운 구성 ---
function populateSavedTickers() {
    // 기존 저장 티커 옵션 제거
    document.querySelectorAll('.saved-ticker-option').forEach(el => el.remove());
    
    const savedList = getSavedTickerList();
    const separator = els.savedTickerSeparator;
    
    if (savedList.length > 0) {
        separator.classList.remove('hidden');
        // 구분선 뒤에 저장된 티커 옵션 추가 (역순 삽입으로 순서 유지)
        [...savedList].reverse().forEach(entry => {
            const opt = document.createElement('option');
            opt.value = `__saved__${entry.symbol}`;
            opt.textContent = `💾 ${entry.symbol} (저장됨 · ${entry.updatedAt})`;
            opt.className = 'saved-ticker-option';
            separator.after(opt);
        });
    } else {
        separator.classList.add('hidden');
    }
}

// 페이지 로드 시 저장된 티커 표시
try { populateSavedTickers(); } catch(e) { console.error('[init] populateSavedTickers 에러:', e); }

// 페이지 로드 시 현재 선택된 티커 정보 표시
try { updateTickerDateInfo(); } catch(e) { console.error('[init] updateTickerDateInfo 에러:', e); }

// 티커 변경 시 날짜 범위 업데이트 + 커스텀 티커 표시
els.tickerSelect.addEventListener('change', () => {
    const val = els.tickerSelect.value;
    
    // 모두 숨기고 시작
    els.customTickerArea.classList.add('hidden');
    els.savedTickerActions.classList.add('hidden');
    els.tickerFetchStatus.classList.add('hidden');
    customTickerCSV = null;
    
    // updateTickerDateInfo의 이전 비동기 호출이 이 변경을 덮어쓰지 않도록 카운터 갱신
    tickerInfoUpdateId++;
    
    if (val === '__custom__') {
        els.customTickerArea.classList.remove('hidden');
        els.tickerDateInfo.textContent = '📅 티커를 입력하고 데이터를 받아오세요.';
    } else if (val.startsWith('__saved__')) {
        els.savedTickerActions.classList.remove('hidden');
        updateTickerDateInfo();
    } else {
        updateTickerDateInfo();
    }
});

// --- 커스텀 티커 데이터 가져오기 (Yahoo Finance) ---
els.fetchTickerBtn.addEventListener('click', async () => {
    const ticker = els.customTickerInput.value.trim().toUpperCase();
    if (!ticker) {
        alert('티커 심볼을 입력해주세요.');
        return;
    }
    
    els.fetchTickerBtn.disabled = true;
    els.fetchTickerBtn.textContent = '⏳ 로딩중...';
    els.tickerFetchStatus.classList.remove('hidden');
    els.tickerFetchStatus.textContent = `${ticker} 데이터를 Yahoo Finance에서 받아오는 중...`;
    els.tickerFetchStatus.className = 'ticker-fetch-status';
    
    try {
        const csvData = await fetchTickerFromYahoo(ticker);
        customTickerCSV = csvData;
        
        const lines = csvData.trim().split('\n');
        const headers = lines[0].split(',');
        const idxDate = headers.findIndex(h => h.includes('Date'));
        const firstDate = lines[1].split(',')[idxDate];
        const lastDate = lines[lines.length - 1].split(',')[idxDate];
        
        tickerDataRanges['__custom__'] = { minDate: firstDate, maxDate: lastDate };
        
        els.tickerDateInfo.textContent = `📅 데이터 기간: ${firstDate} ~ ${lastDate}`;
        els.startDate.value = firstDate;
        els.endDate.value = lastDate;
        
        els.tickerFetchStatus.textContent = `✅ ${ticker} 데이터 로드 완료! (${lines.length - 1}일치)`;
        els.tickerFetchStatus.className = 'ticker-fetch-status fetch-success';
        
        // localStorage에 저장
        saveTickerToStorage(ticker, csvData);
        populateSavedTickers();
        
        // 저장된 티커로 자동 선택 전환
        els.tickerSelect.value = `__saved__${ticker}`;
        els.customTickerArea.classList.add('hidden');
        els.savedTickerActions.classList.remove('hidden');
        const savedList = getSavedTickerList();
        const entry = savedList.find(t => t.symbol === ticker);
        if (entry) {
            els.savedTickerInfo.textContent = `마지막 업데이트: ${entry.updatedAt}`;
        }
    } catch (err) {
        els.tickerFetchStatus.textContent = `❌ ${err.message}`;
        els.tickerFetchStatus.className = 'ticker-fetch-status fetch-error';
        customTickerCSV = null;
        // Yahoo Finance 링크를 해당 티커로 업데이트
        const t = els.customTickerInput.value.trim().toUpperCase();
        if (t && els.yahooFinanceLink) {
            els.yahooFinanceLink.href = `https://finance.yahoo.com/quote/${encodeURIComponent(t)}/history/`;
        }
    } finally {
        els.fetchTickerBtn.disabled = false;
        els.fetchTickerBtn.textContent = '📥 자동 받아오기';
    }
});

// 엔터키로도 티커 가져오기
els.customTickerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        els.fetchTickerBtn.click();
    }
});

// 티커 입력 시 Yahoo Finance 링크 자동 업데이트
els.customTickerInput.addEventListener('input', () => {
    const t = els.customTickerInput.value.trim().toUpperCase();
    if (t && els.yahooFinanceLink) {
        els.yahooFinanceLink.href = `https://finance.yahoo.com/quote/${encodeURIComponent(t)}/history/`;
    }
});

// --- CSV 파일 업로드로 데이터 로드 ---
els.csvFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    els.csvFileName.textContent = file.name;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
        const csvData = evt.target.result;
        
        try {
            // CSV 유효성 검사
            const lines = csvData.trim().split('\n');
            const headers = lines[0].split(',');
            const idxDate = headers.findIndex(h => h.includes('Date'));
            const idxClose = headers.findIndex(h => h.includes('Close'));
            
            if (idxDate === -1 || idxClose === -1 || lines.length < 10) {
                throw new Error('yfinance CSV 형식이 아닙니다. Date, Close 컬럼이 필요합니다.');
            }
            
            const firstDate = lines[1].split(',')[idxDate];
            const lastDate = lines[lines.length - 1].split(',')[idxDate];
            
            // 티커명 추출 (파일명에서 or 입력란에서)
            let ticker = els.customTickerInput.value.trim().toUpperCase();
            if (!ticker) {
                ticker = file.name.replace(/\.csv$/i, '').toUpperCase();
                els.customTickerInput.value = ticker;
            }
            
            customTickerCSV = csvData;
            tickerDataRanges['__custom__'] = { minDate: firstDate, maxDate: lastDate };
            
            els.tickerDateInfo.textContent = `📅 데이터 기간: ${firstDate} ~ ${lastDate}`;
            els.startDate.value = firstDate;
            els.endDate.value = lastDate;
            
            els.tickerFetchStatus.classList.remove('hidden');
            els.tickerFetchStatus.textContent = `✅ ${ticker} CSV 로드 완료! (${lines.length - 1}일치)`;
            els.tickerFetchStatus.className = 'ticker-fetch-status fetch-success';
            
            // localStorage에 저장
            saveTickerToStorage(ticker, csvData);
            populateSavedTickers();
            
            // 저장된 티커로 자동 전환
            els.tickerSelect.value = `__saved__${ticker}`;
            els.customTickerArea.classList.add('hidden');
            els.savedTickerActions.classList.remove('hidden');
            const savedList = getSavedTickerList();
            const entry = savedList.find(t => t.symbol === ticker);
            if (entry) {
                els.savedTickerInfo.textContent = `마지막 업데이트: ${entry.updatedAt}`;
            }
        } catch (err) {
            els.tickerFetchStatus.classList.remove('hidden');
            els.tickerFetchStatus.textContent = `❌ CSV 파싱 실패: ${err.message}`;
            els.tickerFetchStatus.className = 'ticker-fetch-status fetch-error';
        }
    };
    reader.readAsText(file);
});

// --- 저장된 티커 업데이트/삭제 ---
els.updateTickerBtn.addEventListener('click', async () => {
    const val = els.tickerSelect.value;
    if (!val.startsWith('__saved__')) return;
    const symbol = val.replace('__saved__', '');
    
    els.updateTickerBtn.disabled = true;
    els.updateTickerBtn.textContent = '⏳ 업데이트중...';
    els.tickerFetchStatus.classList.remove('hidden');
    els.tickerFetchStatus.textContent = `${symbol} 데이터를 업데이트하는 중...`;
    els.tickerFetchStatus.className = 'ticker-fetch-status';
    
    try {
        const csvData = await fetchTickerFromYahoo(symbol);
        saveTickerToStorage(symbol, csvData);
        populateSavedTickers();
        
        // 선택 복원
        els.tickerSelect.value = `__saved__${symbol}`;
        updateTickerDateInfo();
        
        const savedList = getSavedTickerList();
        const entry = savedList.find(t => t.symbol === symbol);
        if (entry) {
            els.savedTickerInfo.textContent = `마지막 업데이트: ${entry.updatedAt}`;
        }
        
        els.tickerFetchStatus.textContent = `✅ ${symbol} 업데이트 완료!`;
        els.tickerFetchStatus.className = 'ticker-fetch-status fetch-success';
    } catch (err) {
        els.tickerFetchStatus.textContent = `❌ 업데이트 실패: ${err.message}`;
        els.tickerFetchStatus.className = 'ticker-fetch-status fetch-error';
    } finally {
        els.updateTickerBtn.disabled = false;
        els.updateTickerBtn.textContent = '🔄 업데이트';
    }
});

els.deleteTickerBtn.addEventListener('click', () => {
    const val = els.tickerSelect.value;
    if (!val.startsWith('__saved__')) return;
    const symbol = val.replace('__saved__', '');
    
    if (!confirm(`${symbol} 데이터를 삭제하시겠습니까?`)) return;
    
    deleteTickerFromStorage(symbol);
    populateSavedTickers();
    
    // VOO로 복귀
    els.tickerSelect.value = 'VOO';
    els.savedTickerActions.classList.add('hidden');
    els.tickerFetchStatus.classList.add('hidden');
    updateTickerDateInfo();
});

async function fetchTickerFromYahoo(ticker) {
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = 0;
    
    // query1/query2 모두 시도
    const yahooUrls = [
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${startTime}&period2=${endTime}&interval=1d&events=div%7Csplit`,
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${startTime}&period2=${endTime}&interval=1d&events=div%7Csplit`
    ];
    
    // CORS 프록시 목록 (여러 개 시도)
    const corsProxies = [
        url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        url => `https://corsproxy.org/?${encodeURIComponent(url)}`,
    ];
    
    let data = null;
    
    // 1) 직접 요청 (CORS 허용 시)
    for (const yahooUrl of yahooUrls) {
        if (data) break;
        try {
            const resp = await fetch(yahooUrl);
            if (resp.ok) {
                const json = await resp.json();
                if (json?.chart?.result) { data = json; break; }
            }
        } catch (e) { /* CORS block expected */ }
    }
    
    // 2) CORS 프록시로 시도
    if (!data) {
        for (const makeProxy of corsProxies) {
            if (data) break;
            for (const yahooUrl of yahooUrls) {
                if (data) break;
                try {
                    const proxyUrl = makeProxy(yahooUrl);
                    const resp = await fetch(proxyUrl);
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json?.chart?.result) { data = json; break; }
                    }
                } catch (e) { /* proxy failed */ }
            }
        }
    }
    
    if (!data || !data.chart || !data.chart.result) {
        throw new Error(`자동 받아오기 실패 — 아래 Yahoo Finance에서 직접 다운로드 후 업로드해주세요.`);
    }
    
    if (data.chart.error) {
        throw new Error(data.chart.error.description || '알 수 없는 오류');
    }
    
    return convertYahooToCSV(data.chart.result[0]);
}

function convertYahooToCSV(result) {
    const timestamps = result.timestamp;
    if (!timestamps || timestamps.length === 0) throw new Error('데이터가 비어있습니다.');
    
    const quotes = result.indicators.quote[0];
    const dividends = result.events?.dividends || {};
    const splits = result.events?.splits || {};
    
    const divByDate = {};
    for (const key of Object.keys(dividends)) {
        const d = dividends[key];
        const dateStr = formatDateFromTimestamp(d.date);
        divByDate[dateStr] = d.amount;
    }
    
    const splitByDate = {};
    for (const key of Object.keys(splits)) {
        const s = splits[key];
        const dateStr = formatDateFromTimestamp(s.date);
        splitByDate[dateStr] = s.numerator / s.denominator;
    }
    
    let csvLines = ['Date,Open,High,Low,Close,Adj Close,Volume,Dividends,Stock Splits'];
    for (let i = 0; i < timestamps.length; i++) {
        const dateStr = formatDateFromTimestamp(timestamps[i]);
        const close = quotes.close[i];
        if (close === null || close === undefined) continue;
        
        const open = quotes.open[i] || close;
        const high = quotes.high[i] || close;
        const low = quotes.low[i] || close;
        const volume = quotes.volume[i] || 0;
        const dividend = divByDate[dateStr] || 0;
        const split = splitByDate[dateStr] || 0;
        
        csvLines.push(`${dateStr},${open},${high},${low},${close},${close},${volume},${dividend},${split}`);
    }
    
    if (csvLines.length < 2) throw new Error('유효한 데이터가 없습니다.');
    return csvLines.join('\n');
}

function formatDateFromTimestamp(ts) {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// --- 년도별 입금액 설정 모달 ---
els.openYearlySettingBtn.addEventListener('click', () => {
    generateYearlyInputs();
    els.yearlyModal.classList.remove('hidden');
});

els.closeModalBtn.addEventListener('click', () => {
    els.yearlyModal.classList.add('hidden');
});

els.saveYearlyBtn.addEventListener('click', () => {
    saveYearlySettings();
    els.yearlyModal.classList.add('hidden');
});

// 모달 바깥 클릭 시 닫기
els.yearlyModal.addEventListener('click', (e) => {
    if (e.target === els.yearlyModal) {
        els.yearlyModal.classList.add('hidden');
    }
});

function generateYearlyInputs() {
    const startYear = parseInt(els.startDate.value.split('-')[0]) || 2010;
    const endYear = parseInt(els.endDate.value.split('-')[0]) || 2023;
    const defaultAmount = parseFloat(els.regularDeposit.value) || 1000;
    
    els.yearlyInputs.innerHTML = '';
    
    for (let year = startYear; year <= endYear; year++) {
        const div = document.createElement('div');
        div.className = 'yearly-input-group';
        
        const savedAmount = yearlyDeposits[year] || defaultAmount;
        
        div.innerHTML = `
            <label>${year}년</label>
            <input type="number" id="yearly_${year}" value="${savedAmount}" min="0">
        `;
        els.yearlyInputs.appendChild(div);
    }
}

function saveYearlySettings() {
    const startYear = parseInt(els.startDate.value.split('-')[0]) || 2010;
    const endYear = parseInt(els.endDate.value.split('-')[0]) || 2023;
    
    yearlyDeposits = {};
    for (let year = startYear; year <= endYear; year++) {
        const input = document.getElementById(`yearly_${year}`);
        if (input) {
            yearlyDeposits[year] = parseFloat(input.value) || 0;
        }
    }
}

// 자동 증액 적용 버튼
els.applyAutoIncreaseBtn.addEventListener('click', () => {
    const rate = parseFloat(els.autoIncreaseRate.value) / 100;
    const startYear = parseInt(els.startDate.value.split('-')[0]) || 2010;
    const endYear = parseInt(els.endDate.value.split('-')[0]) || 2023;
    const baseAmount = parseFloat(els.regularDeposit.value) || 1000;
    
    let currentAmount = baseAmount;
    for (let year = startYear; year <= endYear; year++) {
        const input = document.getElementById(`yearly_${year}`);
        if (input) {
            input.value = Math.round(currentAmount);
            yearlyDeposits[year] = Math.round(currentAmount);
        }
        currentAmount *= (1 + rate);
    }
});

// --- 1. 시작 버튼 클릭 ---
els.startBtn.addEventListener('click', async () => {
    const ticker = els.tickerSelect.value;
    els.startBtn.textContent = "데이터 불러오는 중...";
    els.startBtn.disabled = true;

    try {
        let csvText;
        if (ticker === '__custom__') {
            if (!customTickerCSV) {
                throw new Error("먼저 '📥 데이터 받아오기'로 티커 데이터를 받아오세요.");
            }
            csvText = customTickerCSV;
        } else if (ticker.startsWith('__saved__')) {
            const symbol = ticker.replace('__saved__', '');
            csvText = loadTickerFromStorage(symbol);
            if (!csvText) throw new Error(`저장된 ${symbol} 데이터를 찾을 수 없습니다.`);
        } else {
            const response = await fetch(`./stock_data/${ticker}.csv`);
            if (!response.ok) throw new Error("CSV 파일을 찾을 수 없습니다.");
            csvText = await response.text();
        }
        
        parseData(csvText);
        initSimulation();

    } catch (err) {
        alert("데이터 로드 실패: " + err.message);
        els.startBtn.textContent = "체험 시작하기";
        els.startBtn.disabled = false;
    }
});

// --- 2. CSV 파싱 (yfinance 포맷 대응) ---
function parseData(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    
    // 컬럼 인덱스 찾기
    const idxDate = headers.findIndex(h => h.includes('Date'));
    const idxClose = headers.findIndex(h => h.includes('Close'));
    // yfinance는 'Dividends', 'Stock Splits' 컬럼을 줍니다.
    const idxDiv = headers.findIndex(h => h.includes('Dividends'));
    const idxSplit = headers.findIndex(h => h.includes('Stock Splits'));

    const startDate = new Date(els.startDate.value);
    const endDate = new Date(els.endDate.value);

    stockData = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        if (row.length < 2) continue;

        const dateStr = row[idxDate];
        const dateObj = new Date(dateStr);

        // 사용자가 선택한 날짜 범위만 필터링
        if (dateObj >= startDate && dateObj <= endDate) {
            stockData.push({
                dateStr: dateStr,
                dateObj: dateObj,
                close: parseFloat(row[idxClose]),
                // 배당, 분할 정보가 있으면 파싱, 없으면 0
                dividend: idxDiv > -1 ? parseFloat(row[idxDiv] || 0) : 0,
                split: idxSplit > -1 ? parseFloat(row[idxSplit] || 0) : 0
            });
        }
    }
    
    // 날짜순 정렬 (혹시 모르니)
    stockData.sort((a, b) => a.dateObj - b.dateObj);

    if (stockData.length === 0) {
        throw new Error("선택한 기간에 데이터가 없습니다.");
    }
    
    // --- 원래 가격 복원 (split-adjusted → unadjusted) ---
    // yfinance의 Close는 액면분할이 소급 적용된 가격.
    // 역순으로 누적 분할 배수를 계산해 원래 가격을 복원한다.
    let cumulativeSplit = 1;
    for (let i = stockData.length - 1; i >= 0; i--) {
        stockData[i].splitFactor = cumulativeSplit;
        stockData[i].originalClose = stockData[i].close * cumulativeSplit;
        stockData[i].originalDividend = stockData[i].dividend * cumulativeSplit;
        // 분할일 당일의 가격은 이미 분할 후 가격이므로 factor=현재값.
        // 분할일 이전 가격은 분할 배수만큼 복원해야 하므로 여기서 누적.
        if (stockData[i].split > 0 && stockData[i].split !== 1) {
            cumulativeSplit *= stockData[i].split;
        }
    }
}

// --- 3. 시뮬레이션 초기화 ---
function initSimulation() {
    // 년도별 입금액이 설정되지 않았으면 기본값으로 채우기
    const startYear = parseInt(els.startDate.value.split('-')[0]) || 2010;
    const endYear = parseInt(els.endDate.value.split('-')[0]) || 2023;
    const defaultAmount = parseFloat(els.regularDeposit.value) || 1000;
    
    if (Object.keys(yearlyDeposits).length === 0) {
        for (let year = startYear; year <= endYear; year++) {
            yearlyDeposits[year] = defaultAmount;
        }
    }
    
    // 상태 초기화
    portfolio.cash = parseFloat(els.initialDeposit.value);
    portfolio.shares = 0;
    portfolio.totalInvested = portfolio.cash;
    portfolio.totalDividends = 0;
    portfolio.currentDepositAmount = yearlyDeposits[startYear] || defaultAmount;
    portfolio.lastDepositMonth = -1;
    portfolio.lastDepositWeek = -1;
    currentIndex = 0;
    isPaused = false;
    speed = 50;
    
    // UI 초기화
    els.logList.innerHTML = "";
    const selectedTicker = els.tickerSelect.value;
    if (selectedTicker === '__custom__') {
        els.displayTicker.textContent = els.customTickerInput.value.trim().toUpperCase();
    } else if (selectedTicker.startsWith('__saved__')) {
        els.displayTicker.textContent = selectedTicker.replace('__saved__', '');
    } else {
        els.displayTicker.textContent = selectedTicker;
    }
    els.pauseBtn.textContent = "일시정지";
    els.pauseBtn.disabled = false;
    els.speedInput.value = speed;
    els.simDate.classList.remove('ended');
    
    // 차트 초기화
    initChart();

    // 화면 전환
    els.setupScreen.classList.add('hidden');
    els.simScreen.classList.remove('hidden');

    // 첫 입금(초기자금) 처리
    buyStock(stockData[0].originalClose, portfolio.cash, "💰 초기 거치금 투자");
    portfolio.cash = 0; // 전액 매수 가정
    
    // 첫 거래일의 월/주를 기록하여 중복 입금 방지
    const firstDay = stockData[0].dateObj;
    portfolio.lastDepositMonth = firstDay.getMonth();
    portfolio.lastDepositWeek = getWeekNumber(firstDay);
    currentIndex = 1; // 첫 날은 이미 처리했으므로 1부터 시작

    // 루프 시작
    runLoop();
}

// --- 4. 시뮬레이션 루프 ---
function runLoop() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
        if (isPaused) return;
        
        // 마지막 데이터에 도달했으면 종료
        if (currentIndex >= stockData.length - 1) {
            clearInterval(timer);
            // 마지막 날 처리
            if (currentIndex === stockData.length - 1) {
                processDay(stockData[currentIndex]);
            }
            addLog("🏁 시뮬레이션 종료", true);
            showEndState();
            return;
        }

        processDay(stockData[currentIndex]);
        currentIndex++;

    }, speed);
}

// 종료 상태 표시
function showEndState() {
    isPaused = true;
    els.pauseBtn.textContent = "종료됨";
    els.pauseBtn.disabled = true;
    els.simDate.textContent = stockData[stockData.length - 1].dateStr + " 🏁";
    els.simDate.classList.add('ended');
}

// --- 5. 하루하루 처리 로직 (핵심) ---
function processDay(dayData) {
    const price = dayData.originalClose;
    const currentYear = dayData.dateObj.getFullYear();
    
    // 0. 역사적 사건 체크
    if (historicalEvents[dayData.dateStr]) {
        addLog(historicalEvents[dayData.dateStr], true);
    }
    
    // A. 액면분할 체크 — 보유 주식 수를 실제로 늘림
    if (dayData.split > 0 && dayData.split !== 1) {
        const oldShares = portfolio.shares;
        portfolio.shares *= dayData.split;
        addLog(`✂️ 액면분할 ${dayData.split}:1 → ${oldShares.toFixed(2)}주 → ${portfolio.shares.toFixed(2)}주`);
    }

    // B. 배당금 체크 (originalDividend 사용)
    if (dayData.originalDividend > 0) {
        const divTotal = portfolio.shares * dayData.originalDividend;
        // 배당 재투자 (DRIP)
        if (divTotal > 0) {
            portfolio.totalDividends += divTotal;
            buyStock(price, divTotal, null);
            addLog(`💎 배당금 $${divTotal.toFixed(2)} 수령 → 재투자 (누적: $${Math.floor(portfolio.totalDividends).toLocaleString()})`);
        }
    }

    // C. 년도별 입금액 설정 적용
    if (yearlyDeposits[currentYear] !== undefined) {
        const newAmount = yearlyDeposits[currentYear];
        if (portfolio.currentDepositAmount !== newAmount) {
            const oldAmount = portfolio.currentDepositAmount;
            portfolio.currentDepositAmount = newAmount;
            if (oldAmount !== newAmount) {
                addLog(`📈 ${currentYear}년 입금액: $${newAmount.toLocaleString()}`);
            }
        }
    }

    // D. 정기 입금 및 매수
    let shouldDeposit = false;
    const freq = els.frequency.value;

    if (freq === 'monthly') {
        const thisMonth = dayData.dateObj.getMonth();
        // 달이 바뀌었을 때 첫 거래일에 매수
        if (thisMonth !== portfolio.lastDepositMonth) {
            shouldDeposit = true;
            portfolio.lastDepositMonth = thisMonth;
        }
    } else if (freq === 'weekly') {
        // [FIX A] "월요일일 때만"이 아니라 "주가 바뀐 첫 거래일"에 매수
        const thisWeek = getWeekNumber(dayData.dateObj);
        if (thisWeek !== portfolio.lastDepositWeek) {
            shouldDeposit = true;
            portfolio.lastDepositWeek = thisWeek;
        }
    }

    if (shouldDeposit && portfolio.currentDepositAmount > 0) {
        portfolio.totalInvested += portfolio.currentDepositAmount;
        buyStock(price, portfolio.currentDepositAmount, "💵 정기 입금");
    }

    // E. UI 업데이트
    updateUI(dayData);
}

function buyStock(price, amount, logMsg) {
    if (price <= 0) return;
    const count = amount / price;
    portfolio.shares += count;
    if (logMsg) {
    }
}

function updateUI(dayData) {
    const currentVal = portfolio.shares * dayData.originalClose;
    const profit = currentVal - portfolio.totalInvested;
    const rate = portfolio.totalInvested > 0 ? (profit / portfolio.totalInvested * 100) : 0;

    els.simDate.textContent = dayData.dateStr;
    els.totalValue.textContent = `$${Math.floor(currentVal).toLocaleString()}`;
    els.totalInvested.textContent = `$${Math.floor(portfolio.totalInvested).toLocaleString()}`;
    els.totalShares.textContent = `${portfolio.shares.toFixed(2)}주`;
    
    els.returnRate.textContent = `${rate.toFixed(2)}%`;
    els.returnRate.className = `value ${rate >= 0 ? 'plus' : 'minus'}`;
    
    // 배당금 및 순수익 표시
    els.totalDividends.textContent = `$${Math.floor(portfolio.totalDividends).toLocaleString()}`;
    els.profitLoss.textContent = `${profit >= 0 ? '+' : ''}$${Math.floor(profit).toLocaleString()}`;
    els.profitLoss.className = `value sub-text ${profit >= 0 ? 'plus' : 'minus'}`;

    // 차트 업데이트 (매일 하면 느리니까 5일에 한번 또는 중요 이벤트때)
    if (currentIndex % 5 === 0 || currentIndex === stockData.length - 1) {
        updateChart(dayData.dateStr, currentVal, portfolio.totalInvested);
    }
}

function addLog(msg, isEvent = false) {
    const li = document.createElement('li');
    if (isEvent) {
        li.className = 'log-event';
    }
    li.innerHTML = `<span style="color:#666">[${stockData[currentIndex].dateStr}]</span> ${msg}`;
    els.logList.prepend(li);
    // 로그가 너무 많으면 삭제
    if (els.logList.children.length > 50) {
        els.logList.lastElementChild.remove();
    }
}

// --- 6. 차트 관련 (Chart.js) ---
function initChart() {
    const ctx = document.getElementById('assetChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: '평가 금액',
                    data: [],
                    borderColor: '#2962ff',
                    backgroundColor: 'rgba(41, 98, 255, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.1
                },
                {
                    label: '투자 원금',
                    data: [],
                    borderColor: '#666',
                    borderWidth: 1,
                    pointRadius: 0,
                    borderDash: [5, 5],
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { display: false },
                y: { 
                    grid: { color: '#333' },
                    ticks: { color: '#888' } 
                }
            },
            plugins: {
                legend: { labels: { color: '#ccc' } }
            }
        }
    });
}

function updateChart(label, value, invested) {
    chartInstance.data.labels.push(label);
    chartInstance.data.datasets[0].data.push(value);
    chartInstance.data.datasets[1].data.push(invested);
    chartInstance.update();
}

// 빠른 처리용 (차트/로그 업데이트 없이 계산만)
function processDayFast(dayData) {
    const price = dayData.originalClose;
    const currentYear = dayData.dateObj.getFullYear();

    // 액면분할 처리
    if (dayData.split > 0 && dayData.split !== 1) {
        portfolio.shares *= dayData.split;
    }

    // 배당금 처리 (originalDividend 사용)
    if (dayData.originalDividend > 0) {
        const divTotal = portfolio.shares * dayData.originalDividend;
        if (divTotal > 0 && price > 0) {
            portfolio.totalDividends += divTotal;
            portfolio.shares += divTotal / price;
        }
    }

    // 년도별 입금액 설정 적용
    if (yearlyDeposits[currentYear] !== undefined) {
        portfolio.currentDepositAmount = yearlyDeposits[currentYear];
    }

    // 정기 입금 및 매수
    let shouldDeposit = false;
    const freq = els.frequency.value;

    if (freq === 'monthly') {
        const thisMonth = dayData.dateObj.getMonth();
        if (thisMonth !== portfolio.lastDepositMonth) {
            shouldDeposit = true;
            portfolio.lastDepositMonth = thisMonth;
        }
    } else if (freq === 'weekly') {
        // [FIX A] 주가 바뀌면(그 주 첫 거래일) 매수
        const thisWeek = getWeekNumber(dayData.dateObj);
        if (thisWeek !== portfolio.lastDepositWeek) {
            shouldDeposit = true;
            portfolio.lastDepositWeek = thisWeek;
        }
    }

    if (shouldDeposit && portfolio.currentDepositAmount > 0 && price > 0) {
        portfolio.totalInvested += portfolio.currentDepositAmount;
        portfolio.shares += portfolio.currentDepositAmount / price;
    }
}

// 차트 재구성 (빠른 점프 후 사용) - 실제 시뮬레이션을 다시 돌려서 데이터 수집
function rebuildChart() {
    initChart();
    
    // 현재 포트폴리오 상태 저장
    const savedPortfolio = { ...portfolio };
    const savedIndex = currentIndex;
    
    // 포트폴리오 초기화 (차트 데이터 수집용)
    const startYear = parseInt(els.startDate.value.split('-')[0]) || 2010;
    const defaultAmount = parseFloat(els.regularDeposit.value) || 1000;
    const initialCash = parseFloat(els.initialDeposit.value);
    
    // 첫 거래일 정보로 초기화 (중복 입금 방지)
    const firstDay = stockData[0].dateObj;
    let tempPortfolio = {
        shares: initialCash / stockData[0].originalClose,
        totalInvested: initialCash,
        totalDividends: 0,
        currentDepositAmount: yearlyDeposits[startYear] || defaultAmount,
        lastDepositMonth: firstDay.getMonth(),
        lastDepositWeek: getWeekNumber(firstDay)
    };
    
    // 차트 포인트 간격: 일반 시뮬레이션과 동일하게 5일 간격 사용
    const step = 5;
    
    // 처음부터 다시 계산하면서 차트 데이터 수집 (첫 날은 초기 거치금으로 처리됨)
    for (let i = 1; i < savedIndex; i++) {
        const dayData = stockData[i];
        const price = dayData.originalClose;
        const currentYear = dayData.dateObj.getFullYear();
        
        // 액면분할 처리
        if (dayData.split > 0 && dayData.split !== 1) {
            tempPortfolio.shares *= dayData.split;
        }
        
        // 배당금 처리 (originalDividend 사용)
        if (dayData.originalDividend > 0) {
            const divTotal = tempPortfolio.shares * dayData.originalDividend;
            if (divTotal > 0 && price > 0) {
                tempPortfolio.totalDividends += divTotal;
                tempPortfolio.shares += divTotal / price;
            }
        }
        
        // 년도별 입금액 설정 적용
        if (yearlyDeposits[currentYear] !== undefined) {
            tempPortfolio.currentDepositAmount = yearlyDeposits[currentYear];
        }
        
        // 정기 입금 및 매수
        let shouldDeposit = false;
        const freq = els.frequency.value;
        
        if (freq === 'monthly') {
            const thisMonth = dayData.dateObj.getMonth();
            if (thisMonth !== tempPortfolio.lastDepositMonth) {
                shouldDeposit = true;
                tempPortfolio.lastDepositMonth = thisMonth;
            }
        } else if (freq === 'weekly') {
            // [FIX A] 주가 바뀌면(그 주 첫 거래일) 매수
            const thisWeek = getWeekNumber(dayData.dateObj);
            if (thisWeek !== tempPortfolio.lastDepositWeek) {
                shouldDeposit = true;
                tempPortfolio.lastDepositWeek = thisWeek;
            }
        }
        
        if (shouldDeposit && tempPortfolio.currentDepositAmount > 0 && price > 0) {
            tempPortfolio.totalInvested += tempPortfolio.currentDepositAmount;
            tempPortfolio.shares += tempPortfolio.currentDepositAmount / price;
        }
        
        // 차트 포인트 추가 (일반 시뮬레이션과 동일하게 5일 간격)
        if (i % step === 0) {
            const val = tempPortfolio.shares * price;
            chartInstance.data.labels.push(dayData.dateStr);
            chartInstance.data.datasets[0].data.push(val);
            chartInstance.data.datasets[1].data.push(tempPortfolio.totalInvested);
        }
    }
    
    chartInstance.update();
    
    // 저장했던 포트폴리오 상태 복원
    portfolio.shares = savedPortfolio.shares;
    portfolio.totalInvested = savedPortfolio.totalInvested;
    portfolio.totalDividends = savedPortfolio.totalDividends;
    portfolio.currentDepositAmount = savedPortfolio.currentDepositAmount;
    portfolio.lastDepositMonth = savedPortfolio.lastDepositMonth;
    portfolio.lastDepositWeek = savedPortfolio.lastDepositWeek;
    currentIndex = savedIndex;
}

// --- 7. 컨트롤 버튼 이벤트 ---
els.pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    els.pauseBtn.textContent = isPaused ? "재개" : "일시정지";
    
    // 재개 시 타이머 다시 시작
    if (!isPaused) {
        runLoop();
    }
});

// 속도 직접 입력
els.applySpeedBtn.addEventListener('click', () => {
    speed = parseInt(els.speedInput.value) || 50;
    if (speed < 0) speed = 0;
    if (speed > 1000) speed = 1000;
    els.speedInput.value = speed;
    runLoop();
});

// 엔터키로도 속도 적용
els.speedInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        els.applySpeedBtn.click();
    }
});

// 날짜 점프
els.jumpBtn.addEventListener('click', () => {
    const targetDate = els.jumpDate.value;
    if (!targetDate) {
        alert('이동할 날짜를 입력하세요 (YYYY-MM-DD)');
        return;
    }
    
    const targetIdx = stockData.findIndex(d => d.dateStr >= targetDate);
    if (targetIdx === -1) {
        alert('해당 날짜를 찾을 수 없습니다.');
        return;
    }
    
    // 타이머 정지
    if (timer) clearInterval(timer);
    
    // 종료 상태 초기화
    els.pauseBtn.disabled = false;
    els.simDate.classList.remove('ended');
    
    // 항상 처음부터 다시 계산해야 투자 원금이 정확함
    // 시뮬레이션 재시작 후 해당 지점까지 빠르게 진행 (로그 유지)
    resetPortfolioState(true, targetDate);
    currentIndex = 0;
    
    // 초기 거치금 투자
    buyStock(stockData[0].originalClose, portfolio.cash, null);
    portfolio.cash = 0;
    
    // 첫 거래일의 월/주를 기록하여 중복 입금 방지
    const firstDay = stockData[0].dateObj;
    portfolio.lastDepositMonth = firstDay.getMonth();
    portfolio.lastDepositWeek = getWeekNumber(firstDay);
    currentIndex = 1; // 첫 날은 이미 처리했으므로 1부터 시작
    
    // 목표 지점까지 빠르게 계산 (차트 업데이트 없이)
    while (currentIndex < targetIdx) {
        processDayFast(stockData[currentIndex]);
        currentIndex++;
    }
    
    // 마지막에 차트 한번만 업데이트
    rebuildChart();
    
    // UI 업데이트
    if (currentIndex < stockData.length) {
        updateUI(stockData[currentIndex]);
    }
    
    // 자동 일시정지 상태로 설정
    isPaused = true;
    els.pauseBtn.textContent = "재개";
});

// 엔터키로도 날짜 점프
els.jumpDate.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        els.jumpBtn.click();
    }
});

// 포트폴리오 상태만 리셋 (화면 전환 없이)
function resetPortfolioState(keepLogs = false, targetDate = null) {
    const startYear = parseInt(els.startDate.value.split('-')[0]) || 2010;
    const defaultAmount = parseFloat(els.regularDeposit.value) || 1000;
    
    portfolio.cash = parseFloat(els.initialDeposit.value);
    portfolio.shares = 0;
    portfolio.totalInvested = portfolio.cash;
    portfolio.totalDividends = 0;
    portfolio.currentDepositAmount = yearlyDeposits[startYear] || defaultAmount;
    portfolio.lastDepositMonth = -1;
    portfolio.lastDepositWeek = -1;
    
    // 차트 초기화
    initChart();
    
    // 로그 처리
    if (keepLogs && targetDate) {
        // 타겟 날짜 이후의 로그만 삭제
        const logs = els.logList.querySelectorAll('li');
        logs.forEach(log => {
            const dateMatch = log.textContent.match(/\[(\d{4}-\d{2}-\d{2})\]/);
            if (dateMatch && dateMatch[1] > targetDate) {
                log.remove();
            }
        });
    } else {
        els.logList.innerHTML = "";
    }
}

// 키보드 화살표로 하루씩 이동 (일시정지 상태에서만)
document.addEventListener('keydown', (e) => {
    // 입력 필드에 포커스되어 있으면 무시
    if (document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'SELECT') {
        return;
    }
    
    // 시뮬레이션 화면이 아니면 무시
    if (els.simScreen.classList.contains('hidden')) {
        return;
    }
    
    if (e.key === 'ArrowRight') {
        // 오른쪽: 다음 날로
        if (currentIndex < stockData.length - 1) {
            if (timer) clearInterval(timer);
            isPaused = true;
            
            // 종료 상태 초기화
            els.pauseBtn.disabled = false;
            els.simDate.classList.remove('ended');
            els.pauseBtn.textContent = "재개";
            
            processDay(stockData[currentIndex]);
            currentIndex++;

            // [FIX C] processDay 내부에서 updateUI(dayData)를 이미 호출함.
            // 여기서 다음날 데이터로 updateUI를 다시 호출하면 UI/포트폴리오가 꼬일 수 있으므로 제거.
            // updateUI(stockData[currentIndex]); // 제거됨
        }
    } else if (e.key === 'ArrowLeft') {
        // 왼쪽: 이전 날로 (재계산 필요)
        if (currentIndex > 1) {
            if (timer) clearInterval(timer);
            isPaused = true;
            
            // 종료 상태 초기화
            els.pauseBtn.disabled = false;
            els.simDate.classList.remove('ended');
            els.pauseBtn.textContent = "재개";
            
            const targetIdx = currentIndex - 1;
            const targetDate = stockData[targetIdx].dateStr;
            resetPortfolioState(true, targetDate);
            currentIndex = 0;
            buyStock(stockData[0].originalClose, portfolio.cash, null);
            portfolio.cash = 0;
            
            // 첫 거래일의 월/주를 기록하여 중복 입금 방지
            const firstDay = stockData[0].dateObj;
            portfolio.lastDepositMonth = firstDay.getMonth();
            portfolio.lastDepositWeek = getWeekNumber(firstDay);
            currentIndex = 1; // 첫 날은 이미 처리했으므로 1부터 시작
            
            while (currentIndex < targetIdx) {
                processDayFast(stockData[currentIndex]);
                currentIndex++;
            }
            rebuildChart();
            updateUI(stockData[currentIndex]);
        }
    } else if (e.key === ' ') {
        // 스페이스바: 일시정지 토글
        e.preventDefault();
        els.pauseBtn.click();
    }
});

els.skipBtn.addEventListener('click', () => {
    // 1년(약 252거래일)치 데이터만 빠르게 계산하고 렌더링은 건너뜀
    const targetIdx = Math.min(currentIndex + 252, stockData.length - 1);
    
    // 계산 루프 (차트 업데이트 없이)
    while(currentIndex < targetIdx) {
        processDayFast(stockData[currentIndex]);
        currentIndex++;
    }
    
    // 마지막에 차트 한번만 업데이트
    rebuildChart();
    
    // UI 업데이트
    if (currentIndex < stockData.length) {
        updateUI(stockData[currentIndex]);
    }
    
    // 끝에 도달했으면 종료 상태 표시
    if (currentIndex >= stockData.length - 1) {
        showEndState();
    }
});

els.resetBtn.addEventListener('click', () => {
    location.reload();
});
