// 只读模式标志（index.html 默认只读；edit.html 通过 edit.js 设为 false）
        let isReadOnly = true;
        let selectedOption = null;
        let selectedDates = [];
        let currentProgramId = null;
        let isEditMode = false;

        // 回到顶部功能
        function scrollToTop() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }

        // 监听滚动事件，显示/隐藏回到顶部按钮
        window.addEventListener('scroll', function() {
            const backToTopBtn = document.getElementById('backToTop');
            if (window.scrollY > 300) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        });
        
        let scheduleData = [];

        // COS配置
        const COS_CONFIG = {
            _s1: atob('QUtJRGhtYVE2YXJ1bERWVUl1TFlZUjZZZ2JKcEFJRzFhdzYz'),
            _s2: atob('bVZBakFUeEtaaGhjUDVuT3JDUmFiVkl6WHhHVWFZUDg='),
            _b1: 'form-' + atob('MTQ0NjA1MzM1Nw=='),
            _r1: atob('YXAtZ3Vhbmd6aG91')
        };

        // 初始化COS客户端
        const cos = new COS({
            SecretId: COS_CONFIG._s1,
            SecretKey: COS_CONFIG._s2
        });

        // 将 COS 返回的 Body 转为字符串（浏览器中是 ArrayBuffer，Node 中是 Buffer）
        function cosBodyToString(body) {
            if (typeof body === 'string') return body;
            if (body instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(body);
            if (body && typeof body.toString === 'function') return body.toString();
            return '';
        }

        // 从COS加载数据
        async function loadDataFromCOS() {
            try {
                const result = await cos.getObject({
                    Bucket: COS_CONFIG._b1,
                    Region: COS_CONFIG._r1,
                    Key: 'data/latest.json'
                });

                const data = JSON.parse(cosBodyToString(result.Body));
                otherServices = normalizeOtherServiceList(data.otherServices || []);
                if (data.scheduleData) {
                    scheduleData = data.scheduleData;
                    const cloudStatus = document.getElementById('cloudStatus');
                    if (cloudStatus) {
                        cloudStatus.textContent = '☁️ 已同步';
                        cloudStatus.className = 'cloud-status success';
                    }
                }
                return true;
            } catch (err) {
                console.log('从COS加载失败，检查是否首次运行:', err);
                // 如果是文件不存在，尝试初始化数据
                if (err && err.code === 'NoSuchKey') {
                    console.log('首次运行，初始化数据到COS...');
                    await saveDataToCOS();
                    return true;
                }
                const cloudStatus = document.getElementById('cloudStatus');
                if (cloudStatus) {
                    cloudStatus.textContent = '📦 本地模式';
                    cloudStatus.className = 'cloud-status offline';
                }
                return false;
            }
        }

        // 保存数据到COS
        async function saveDataToCOS() {
            if (isReadOnly) return;
            const now = new Date();
            const data = {
                scheduleData: scheduleData,
                otherServices: normalizeOtherServiceList(otherServices),
                backupTime: now.toISOString()
            };

            try {
                const cloudStatus = document.getElementById('cloudStatus');
                if (cloudStatus) {
                    cloudStatus.textContent = '☁️ 同步中...';
                    cloudStatus.className = 'cloud-status syncing';
                }

                // 保存最新数据
                await cos.putObject({
                    Bucket: COS_CONFIG._b1,
                    Region: COS_CONFIG._r1,
                    Key: 'data/latest.json',
                    Body: JSON.stringify(data, null, 2),
                    ContentType: 'application/json; charset=utf-8'
                });

                // 同时保存一份带日期的历史归档（按天命名，同一天会覆盖）
                const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
                const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, ''); // HHmmss
                const historyKey = `data/history/${dateStr}_${timeStr}.json`;
                await cos.putObject({
                    Bucket: COS_CONFIG._b1,
                    Region: COS_CONFIG._r1,
                    Key: historyKey,
                    Body: JSON.stringify(data, null, 2),
                    ContentType: 'application/json; charset=utf-8'
                });

                if (cloudStatus) {
                    cloudStatus.textContent = '☁️ 已同步';
                    cloudStatus.className = 'cloud-status success';
                }
                return true;
            } catch (err) {
                console.log('保存到COS失败:', err);
                const cloudStatus = document.getElementById('cloudStatus');
                if (cloudStatus) {
                    cloudStatus.textContent = '⚠️ 同步失败';
                    cloudStatus.className = 'cloud-status error';
                }
                return false;
            }
        }

        let otherServices = [];

        function normalizeOtherService(service) {
            if (!service) return null;
            const rawDates = Array.isArray(service.dates)
                ? service.dates
                : (service.date ? [service.date] : []);
            const dates = [...new Set(rawDates.filter(Boolean))].sort();
            if (dates.length === 0) return null;
            return {
                ...service,
                type: 'otherService',
                dates: dates,
                date: dates[0]
            };
        }

        function normalizeOtherServiceList(services) {
            if (!Array.isArray(services)) return [];
            return services
                .map(service => normalizeOtherService(service))
                .filter(Boolean);
        }

        function getOtherServiceDates(service) {
            const normalized = normalizeOtherService(service);
            return normalized ? normalized.dates : [];
        }

        function expandOtherServices(services) {
            const expanded = [];
            normalizeOtherServiceList(services).forEach(service => {
                service.dates.forEach(date => {
                    expanded.push({
                        ...service,
                        date: date
                    });
                });
            });
            return expanded;
        }

        function backupToCloud() {
            if (isReadOnly) return;
            saveDataToCOS();
        }

        function checkCloudStatus() {
            loadDataFromCOS().then(() => {
                renderSchedule();
            });
        }

        function showPage(pageId) {
            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });
            document.getElementById(pageId).classList.add('active');
        }

        function goHome() {
            showPage('page-home');
            selectedOption = null;
            selectedDates = [];
            currentProgramId = null;
            isEditMode = false;
            document.getElementById('reserveForm').reset();
            document.getElementById('selectedDates').innerHTML = '';
            document.getElementById('reserveSubmitBtn').disabled = true;
            document.getElementById('reserveSubmitBtn').textContent = '确认预约';
            document.getElementById('reserveTitle').textContent = '预约申请';
            document.getElementById('reserveSubtitle').textContent = '请填写预约信息，可选择多个日期';
            document.querySelector('input[name="editId"]').value = '';
            
            // 恢复所有演播室选项的显示
            const studio800Checkbox = document.querySelector('input[name="studio"][value="800"]');
            const studio1800Checkbox = document.querySelector('input[name="studio"][value="1800"]');
            if (studio800Checkbox) studio800Checkbox.parentElement.style.display = 'block';
            if (studio1800Checkbox) studio1800Checkbox.parentElement.style.display = 'block';
            
            renderSchedule();
            
            backupToCloud();
        }

        function showTaskSheet() {
            renderTaskSheet();
            showPage('page-task');
        }

        // ========== 数据统计功能 ==========
        function showStatistics() {
            renderStatistics();
            showPage('page-statistics');
        }

        function renderStatistics() {
            const content = document.getElementById('statisticsContent');
            if (!scheduleData || scheduleData.length === 0) {
                content.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">暂无数据</p>';
                return;
            }

            // 基础统计
            const total = scheduleData.length;
            const filled = scheduleData.filter(r => r.status === 'filled').length;
            const pending = scheduleData.filter(r => r.status === 'pending').length;
            const cancelled = scheduleData.filter(r => r.status === 'cancelled' || r.status === 'filled_cancelled').length;

            // 按类型统计
            const typeMap = {};
            scheduleData.forEach(r => {
                const type = r.type || '未知';
                typeMap[type] = (typeMap[type] || 0) + 1;
            });
            const typeNameMap = { studio: '综艺演播室', nanDaTang: '南大堂', outside: '外场转播', otherService: '其他服务' };

            // 按部门统计
            const deptMap = {};
            scheduleData.forEach(r => {
                if (r.department) {
                    deptMap[r.department] = (deptMap[r.department] || 0) + 1;
                }
            });

            // 按演播室/场地统计
            const studioMap = {};
            scheduleData.forEach(r => {
                if (r.studio) {
                    studioMap[r.studio] = (studioMap[r.studio] || 0) + 1;
                }
            });

            // 按节目名称统计
            const programMap = {};
            scheduleData.forEach(r => {
                if (r.programName) {
                    if (!programMap[r.programName]) programMap[r.programName] = { total: 0, filled: 0 };
                    programMap[r.programName].total++;
                    if (r.status === 'filled') programMap[r.programName].filled++;
                }
            });

            // 日期范围
            const dates = scheduleData.map(r => r.date).filter(Boolean).sort();
            const dateRange = dates.length > 0 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : '无';

            let html = '';

            // 总览卡片
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px;">';
            html += `<div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 12px;">
                        <div style="font-size: 13px; opacity: 0.9;">总预约数</div>
                        <div style="font-size: 32px; font-weight: 700; margin-top: 4px;">${total}</div>
                     </div>`;
            html += `<div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px; border-radius: 12px;">
                        <div style="font-size: 13px; opacity: 0.9;">已确认</div>
                        <div style="font-size: 32px; font-weight: 700; margin-top: 4px;">${filled}</div>
                     </div>`;
            html += `<div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 20px; border-radius: 12px;">
                        <div style="font-size: 13px; opacity: 0.9;">待填单</div>
                        <div style="font-size: 32px; font-weight: 700; margin-top: 4px;">${pending}</div>
                     </div>`;
            html += `<div style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 20px; border-radius: 12px;">
                        <div style="font-size: 13px; opacity: 0.9;">已取消</div>
                        <div style="font-size: 32px; font-weight: 700; margin-top: 4px;">${cancelled}</div>
                     </div>`;
            html += '</div>';

            html += `<p style="color: #666; margin-bottom: 24px;">📅 数据日期范围：<strong>${dateRange}</strong></p>`;

            // 按类型统计
            html += '<div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">';
            html += '<h3 style="margin-bottom: 16px; color: #1a1a2e;">按类型统计</h3>';
            html += '<table style="width: 100%; border-collapse: collapse;"><thead><tr style="border-bottom: 2px solid #e5e7eb;"><th style="text-align: left; padding: 10px;">类型</th><th style="text-align: right; padding: 10px;">数量</th><th style="text-align: right; padding: 10px;">占比</th></tr></thead><tbody>';
            Object.keys(typeMap).forEach(type => {
                const pct = ((typeMap[type] / total) * 100).toFixed(1);
                html += `<tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 10px;">${typeNameMap[type] || type}</td><td style="text-align: right; padding: 10px; font-weight: 600;">${typeMap[type]}</td><td style="text-align: right; padding: 10px; color: #666;">${pct}%</td></tr>`;
            });
            html += '</tbody></table></div>';

            // 按演播室/场地统计
            html += '<div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">';
            html += '<h3 style="margin-bottom: 16px; color: #1a1a2e;">按场地统计</h3>';
            html += '<table style="width: 100%; border-collapse: collapse;"><thead><tr style="border-bottom: 2px solid #e5e7eb;"><th style="text-align: left; padding: 10px;">场地</th><th style="text-align: right; padding: 10px;">数量</th></tr></thead><tbody>';
            Object.keys(studioMap).sort((a, b) => studioMap[b] - studioMap[a]).forEach(studio => {
                html += `<tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 10px;">${studio}</td><td style="text-align: right; padding: 10px; font-weight: 600;">${studioMap[studio]}</td></tr>`;
            });
            html += '</tbody></table></div>';

            // 按部门统计
            html += '<div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">';
            html += '<h3 style="margin-bottom: 16px; color: #1a1a2e;">按部门统计</h3>';
            html += '<table style="width: 100%; border-collapse: collapse;"><thead><tr style="border-bottom: 2px solid #e5e7eb;"><th style="text-align: left; padding: 10px;">部门</th><th style="text-align: right; padding: 10px;">数量</th></tr></thead><tbody>';
            Object.keys(deptMap).sort((a, b) => deptMap[b] - deptMap[a]).forEach(dept => {
                html += `<tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 10px;">${dept}</td><td style="text-align: right; padding: 10px; font-weight: 600;">${deptMap[dept]}</td></tr>`;
            });
            html += '</tbody></table></div>';

            // 按节目统计
            html += '<div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">';
            html += '<h3 style="margin-bottom: 16px; color: #1a1a2e;">按节目统计</h3>';
            html += '<table style="width: 100%; border-collapse: collapse;"><thead><tr style="border-bottom: 2px solid #e5e7eb;"><th style="text-align: left; padding: 10px;">节目名称</th><th style="text-align: right; padding: 10px;">总预约</th><th style="text-align: right; padding: 10px;">已确认</th></tr></thead><tbody>';
            Object.keys(programMap).sort((a, b) => programMap[b].total - programMap[a].total).forEach(name => {
                const p = programMap[name];
                html += `<tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 10px;">${name}</td><td style="text-align: right; padding: 10px; font-weight: 600;">${p.total}</td><td style="text-align: right; padding: 10px; color: #10b981; font-weight: 600;">${p.filled}</td></tr>`;
            });
            html += '</tbody></table></div>';

            content.innerHTML = html;
        }

        // ========== 历史数据查看功能 ==========
        async function loadHistoryList() {
            const listEl = document.getElementById('historyList');
            listEl.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">加载中...</p>';

            try {
                const result = await cos.getBucket({
                    Bucket: COS_CONFIG._b1,
                    Region: COS_CONFIG._r1,
                    Prefix: 'data/history/',
                    MaxKeys: 100
                });

                const items = result.Contents || [];
                if (items.length === 0) {
                    listEl.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">暂无历史归档数据</p>';
                    return;
                }

                // 按时间倒序排列
                items.sort((a, b) => b.Key.localeCompare(a.Key));

                let html = '<div style="background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">';
                html += '<table style="width: 100%; border-collapse: collapse;"><thead><tr style="border-bottom: 2px solid #e5e7eb;"><th style="text-align: left; padding: 10px;">归档时间</th><th style="text-align: right; padding: 10px;">操作</th></tr></thead><tbody>';
                items.forEach(item => {
                    // 从文件名提取时间：data/history/2026-06-23_143022.json
                    const fileName = item.Key.split('/').pop().replace('.json', '');
                    const datePart = fileName.split('_')[0];
                    const timePart = fileName.split('_')[1] || '';
                    let displayTime = fileName;
                    if (timePart && timePart.length === 6) {
                        displayTime = `${datePart} ${timePart.slice(0,2)}:${timePart.slice(2,4)}:${timePart.slice(4,6)}`;
                    }
                    html += `<tr style="border-bottom: 1px solid #f3f4f6;">
                        <td style="padding: 10px;">${displayTime}</td>
                        <td style="text-align: right; padding: 10px;">
                            <button onclick="loadHistoryData('${item.Key}')" style="padding: 4px 12px; background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; border-radius: 4px; cursor: pointer; font-size: 12px;">查看</button>
                        </td>
                    </tr>`;
                });
                html += '</tbody></table></div>';
                listEl.innerHTML = html;
            } catch (err) {
                console.log('加载历史列表失败:', err);
                listEl.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 20px;">加载失败：' + (err.message || err) + '</p>';
            }
        }

        async function loadHistoryData(key) {
            const detailEl = document.getElementById('historyDetail');
            detailEl.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">加载历史数据中...</p>';
            detailEl.scrollIntoView({ behavior: 'smooth' });

            try {
                const result = await cos.getObject({
                    Bucket: COS_CONFIG._b1,
                    Region: COS_CONFIG._r1,
                    Key: key
                });

                const data = JSON.parse(cosBodyToString(result.Body));
                const historyData = data.scheduleData || [];
                const backupTime = data.backupTime || '未知';

                const total = historyData.length;
                const filled = historyData.filter(r => r.status === 'filled').length;
                const pending = historyData.filter(r => r.status === 'pending').length;
                const cancelled = historyData.filter(r => r.status === 'cancelled' || r.status === 'filled_cancelled').length;

                // 按类型统计
                const typeMap = {};
                historyData.forEach(r => {
                    const type = r.type || '未知';
                    typeMap[type] = (typeMap[type] || 0) + 1;
                });
                const typeNameMap = { studio: '综艺演播室', nanDaTang: '南大堂', outside: '外场转播', otherService: '其他服务' };

                let html = `<div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">`;
                html += `<h3 style="margin-bottom: 12px; color: #1a1a2e;">历史快照：${backupTime}</h3>`;
                html += `<p style="color: #666; margin-bottom: 16px;">归档文件：${key}</p>`;

                // 统计卡片
                html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px;">';
                html += `<div style="background: #f9fafb; padding: 16px; border-radius: 8px; text-align: center;"><div style="font-size: 12px; color: #666;">总数</div><div style="font-size: 24px; font-weight: 700; color: #1a1a2e;">${total}</div></div>`;
                html += `<div style="background: #ecfdf5; padding: 16px; border-radius: 8px; text-align: center;"><div style="font-size: 12px; color: #666;">已确认</div><div style="font-size: 24px; font-weight: 700; color: #059669;">${filled}</div></div>`;
                html += `<div style="background: #fffbeb; padding: 16px; border-radius: 8px; text-align: center;"><div style="font-size: 12px; color: #666;">待填单</div><div style="font-size: 24px; font-weight: 700; color: #d97706;">${pending}</div></div>`;
                html += `<div style="background: #fef2f2; padding: 16px; border-radius: 8px; text-align: center;"><div style="font-size: 12px; color: #666;">已取消</div><div style="font-size: 24px; font-weight: 700; color: #dc2626;">${cancelled}</div></div>`;
                html += '</div>';

                // 按类型统计
                if (Object.keys(typeMap).length > 0) {
                    html += '<h4 style="margin-bottom: 10px; color: #1a1a2e;">按类型统计</h4>';
                    html += '<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;"><thead><tr style="border-bottom: 2px solid #e5e7eb;"><th style="text-align: left; padding: 8px;">类型</th><th style="text-align: right; padding: 8px;">数量</th></tr></thead><tbody>';
                    Object.keys(typeMap).forEach(type => {
                        html += `<tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 8px;">${typeNameMap[type] || type}</td><td style="text-align: right; padding: 8px; font-weight: 600;">${typeMap[type]}</td></tr>`;
                    });
                    html += '</tbody></table>';
                }

                // 节目列表
                if (historyData.length > 0) {
                    html += '<h4 style="margin-bottom: 10px; color: #1a1a2e;">节目列表</h4>';
                    html += '<table style="width: 100%; border-collapse: collapse;"><thead><tr style="border-bottom: 2px solid #e5e7eb;"><th style="text-align: left; padding: 8px;">日期</th><th style="text-align: left; padding: 8px;">节目</th><th style="text-align: left; padding: 8px;">场地</th><th style="text-align: left; padding: 8px;">部门</th><th style="text-align: left; padding: 8px;">状态</th></tr></thead><tbody>';
                    historyData.sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(r => {
                        const statusText = r.status === 'filled' ? '已确认' : r.status === 'pending' ? '待填单' : '已取消';
                        const statusColor = r.status === 'filled' ? '#059669' : r.status === 'pending' ? '#d97706' : '#dc2626';
                        html += `<tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 8px;">${r.date || '-'}</td><td style="padding: 8px;">${r.programName || '-'}</td><td style="padding: 8px;">${r.studio || '-'}</td><td style="padding: 8px;">${r.department || '-'}</td><td style="padding: 8px; color: ${statusColor};">${statusText}</td></tr>`;
                    });
                    html += '</tbody></table>';
                }

                html += '</div>';
                detailEl.innerHTML = html;
            } catch (err) {
                console.log('加载历史数据失败:', err);
                detailEl.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 20px;">加载失败：' + (err.message || err) + '</p>';
            }
        }

        // 任务单搜索关键词
        let taskSearchKeyword = '';
        let selectedTaskWeekType = 'current';

        function formatLocalDateString(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function parseLocalDateString(dateStr) {
            const [year, month, day] = dateStr.split('-').map(Number);
            return new Date(year, month - 1, day);
        }

        function getWeekMondayString(offsetWeeks = 0) {
            const today = new Date();
            const day = today.getDay();
            const diff = day === 0 ? -6 : (1 - day);
            const monday = new Date(today);
            monday.setHours(0, 0, 0, 0);
            monday.setDate(today.getDate() + diff + (offsetWeeks * 7));
            return formatLocalDateString(monday);
        }

        function getCurrentWeekMondayString() {
            return getWeekMondayString(0);
        }

        function getNextWeekMondayString() {
            return getWeekMondayString(1);
        }

        function getWeekDatesByStart(weekStart) {
            const dates = [];
            const start = parseLocalDateString(weekStart);
            for (let i = 0; i < 7; i++) {
                const current = new Date(start);
                current.setDate(start.getDate() + i);
                dates.push(formatLocalDateString(current));
            }
            return dates;
        }

        function getTaskWeekStart() {
            return selectedTaskWeekType === 'next' ? getNextWeekMondayString() : getCurrentWeekMondayString();
        }

        function formatTaskWeekRange() {
            const dates = getWeekDatesByStart(getTaskWeekStart());
            return `${formatDateShort(dates[0])} - ${formatDateShort(dates[6])}`;
        }

        function changeTaskWeek(type) {
            selectedTaskWeekType = type === 'next' ? 'next' : 'current';
            renderTaskSheet();
        }

        function searchTaskSheet() {
            const input = document.getElementById('taskSearchInput');
            taskSearchKeyword = input.value.trim().toLowerCase();
            renderTaskSheet();
        }

        function toggleTaskPastDates() {
            const toggleRow = document.getElementById('taskPastToggleRow');
            if (!toggleRow) return;
            const isExpanded = toggleRow.classList.contains('expanded');
            const pastRows = document.querySelectorAll('.task-past-date-row');
            if (isExpanded) {
                toggleRow.classList.remove('expanded');
                toggleRow.querySelector('.toggle-icon').textContent = '▶';
                pastRows.forEach(row => row.classList.remove('visible'));
            } else {
                toggleRow.classList.add('expanded');
                toggleRow.querySelector('.toggle-icon').textContent = '▼';
                pastRows.forEach(row => row.classList.add('visible'));
            }
        }

        function renderTaskItemContent(item, date, options = {}) {
            const includeActions = options.includeActions === true;
            const flowNameMap = {
                'zhibo': '直播',
                'luzhi': '录制',
                '搭建调试': '搭建调试',
                '彩排': '彩排',
                '装台': '装台',
                '场地': '场地',
                '装调灯': '装调灯',
                '不带机彩排': '不带机彩排',
                '带机彩排': '带机彩排'
            };

            const equipment = item.equipment || {};
            const flowTimes = item.flowTimes || {};
            const cameraCount = equipment.cameraCount !== undefined && equipment.cameraCount !== '' ? equipment.cameraCount : '-';
            const hasJib = equipment.jib === '是';
            const applicant = item.applicant || '-';
            const otherReq = equipment.otherRequirements || '';
            let html = '';

            const flowList = [];
            Object.keys(flowTimes).forEach(flowName => {
                flowTimes[flowName].forEach(ft => {
                    flowList.push({ name: flowName, ...ft });
                });
            });

            const filteredFlowList = flowList
                .filter(ft => ft.startDate === date)
                .sort((a, b) => a.startTime.localeCompare(b.startTime));

            if (item.type === 'otherService') {
                html += `<div class="task-program">${item.programName}</div>`;
                html += `<div style="display: flex; gap: 12px; align-items: center; margin: 4px 0;"><span class="task-meta">👤 ${applicant}</span></div>`;
                if (item.serviceDetails) {
                    html += `<div class="task-other">📝 ${item.serviceDetails}</div>`;
                }
                if (includeActions && !isReadOnly) {
                    html += `
                        <div class="task-inline-actions">
                            <button type="button" class="btn btn-small btn-edit-small" onclick="editOtherService('${item.id}')">编辑</button>
                            <button type="button" class="btn btn-small btn-delete-small" onclick="deleteOtherService('${item.id}')">删除</button>
                        </div>
                    `;
                }
            } else if (item.type === 'studio' || item.type === 'nanDaTang') {
                html += `<div class="task-program">${item.programName}${item.visitMode ? ' <span style="font-size: 11px; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">参观模式</span>' : ''}</div>`;
                html += `<div style="display: flex; gap: 12px; align-items: center; margin: 4px 0;"><span class="task-meta">🏢 ${item.department}</span><span class="task-meta">👤 ${applicant}</span></div>`;

                if (!item.visitMode && item.type === 'studio') {
                    html += `<div class="task-meta">📹 <span style="font-size: 15px; font-weight: 600; color: #e65100;">${cameraCount}</span>机位${hasJib ? ' <span class="task-jib">含摇臂</span>' : ''}</div>`;
                }

                if (!item.visitMode && filteredFlowList.length > 0) {
                    html += '<div style="margin-top: 6px;">';
                    filteredFlowList.forEach(flow => {
                        const displayName = flowNameMap[flow.name] || flow.name;
                        html += `<div style="margin-bottom: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;"><span class="task-flow" style="font-size: 12px;">${displayName}</span><span class="task-time" style="font-size: 12px;">${flow.startTime}-${flow.endTime}</span></div>`;
                    });

                    if (equipment.screenControl === '是') {
                        html += `<div style="margin-top: 4px;"><span style="background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">屏控</span></div>`;
                    }

                    html += '</div>';
                }

                if (item.visitMode) {
                    if (item.other) {
                        html += `<div class="task-other">📝 ${item.other}</div>`;
                    }
                } else if (otherReq) {
                    html += `<div class="task-other">📝 ${otherReq}</div>`;
                }
            } else {
                html += `<div class="task-program">${item.programName}</div>`;
                if (item.projectLocation) {
                    html += `<div class="task-meta">📍 ${item.projectLocation}</div>`;
                }
                html += `<div style="display: flex; gap: 12px; align-items: center; margin: 4px 0;"><span class="task-meta">🏢 ${item.department}</span><span class="task-meta">👤 ${applicant}</span></div>`;
                html += `<div class="task-meta">📹 <span style="font-size: 15px; font-weight: 600; color: #e65100;">${cameraCount}</span>机位${hasJib ? ' <span class="task-jib">含摇臂</span>' : ''}</div>`;

                if (filteredFlowList.length > 0) {
                    html += '<div style="margin-top: 6px;">';
                    filteredFlowList.forEach(flow => {
                        const displayName = flowNameMap[flow.name] || flow.name;
                        html += `<div style="margin-bottom: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;"><span class="task-flow" style="font-size: 12px;">${displayName}</span><span class="task-time" style="font-size: 12px;">${flow.startTime}-${flow.endTime}</span></div>`;
                    });
                    html += '</div>';
                } else {
                    html += '<div class="task-meta" style="color: #ccc;">今日无流程</div>';
                }

                if (otherReq) {
                    html += `<div class="task-other">📝 ${otherReq}</div>`;
                }
            }

            return html;
        }

        function renderTaskSheetRow(date, dateGroups, columns, weekdays, todayStr, isPast) {
            const isToday = date === todayStr;
            let html = `<tr${isToday ? ' class="today-row"' : ''}${isPast ? ' class="task-past-date-row"' : ''}>`;

            const dateObj = new Date(date);
            const dateStr = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
            const weekdayStr = weekdays[dateObj.getDay()];
            html += `<td class="date-cell">${dateStr}${isToday ? '<span class="today-badge">今天</span>' : ''}<span class="weekday">${weekdayStr}</span></td>`;

            columns.forEach(col => {
                const colItems = dateGroups[date].filter(item => {
                    if (item.type === 'otherService' && col === '其他服务') return true;

                    if (item.type === 'studio' || item.type === 'nanDaTang') {
                        if (item.studio === '800' && col === '800演播室') return true;
                        if (item.studio === '1800' && col === '1800演播室') return true;
                        if (item.studio === '南大堂' && col === '南大堂') return true;
                    }
                    if (item.type === 'outside') {
                        const equipSystem = (item.equipment && item.equipment.broadcastSystem) || '';
                        if (equipSystem === col) return true;
                    }
                    return false;
                });

                if (colItems.length === 0) {
                    html += '<td class="task-cell empty-cell"><div class="task-empty">-</div></td>';
                    return;
                }

                let cellContent = '';
                colItems.forEach((item, idx) => {
                    cellContent += renderTaskItemContent(item, date, { includeActions: true });

                    if (idx < colItems.length - 1) {
                        cellContent += '<div class="event-divider" style="border-top: 1px solid #ddd; margin: 8px 0;"></div>';
                    }
                });

                html += `<td class="task-cell has-content">${cellContent}</td>`;
            });

            html += '</tr>';
            return html;
        }

        function renderTaskSheet() {
            const taskWeekStart = getTaskWeekStart();
            const weekDates = getWeekDatesByStart(taskWeekStart);
            const weekDateSet = new Set(weekDates);
            let filledRecords = scheduleData.filter(r => r.status === 'filled' && weekDateSet.has(r.date));
            let taskOtherServices = expandOtherServices(otherServices).filter(service => weekDateSet.has(service.date));

            const weekLabel = document.getElementById('taskWeekLabel');
            if (weekLabel) {
                const weekName = selectedTaskWeekType === 'next' ? '下周任务单' : '本周任务单';
                weekLabel.textContent = `${weekName}：${formatTaskWeekRange()}`;
            }
            const currentBtn = document.getElementById('taskCurrentWeekBtn');
            const nextBtn = document.getElementById('taskNextWeekBtn');
            if (currentBtn) currentBtn.classList.toggle('active', selectedTaskWeekType === 'current');
            if (nextBtn) nextBtn.classList.toggle('active', selectedTaskWeekType === 'next');

            // 搜索过滤
            if (taskSearchKeyword) {
                filledRecords = filledRecords.filter(r => {
                    const name = (r.programName || '').toLowerCase();
                    const dept = (r.department || '').toLowerCase();
                    const applicant = (r.applicant || '').toLowerCase();
                    return name.includes(taskSearchKeyword) ||
                           dept.includes(taskSearchKeyword) ||
                           applicant.includes(taskSearchKeyword);
                });

                taskOtherServices = taskOtherServices.filter(service => {
                    const name = (service.programName || '').toLowerCase();
                    const applicant = (service.applicant || '').toLowerCase();
                    const details = (service.serviceDetails || '').toLowerCase();
                    return name.includes(taskSearchKeyword) ||
                           applicant.includes(taskSearchKeyword) ||
                           details.includes(taskSearchKeyword);
                });
            }
            
            const dateGroups = {};
            weekDates.forEach(date => {
                dateGroups[date] = [];
            });
            filledRecords.forEach(item => {
                dateGroups[item.date].push(item);
            });

            taskOtherServices.forEach(service => {
                dateGroups[service.date].push(service);
            });

            const columns = ['800演播室', '1800演播室', '南大堂', '4K车', '高清车', '4K EFP', '高清EFP', '简易EFP', '其他服务'];
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const sortedDates = weekDates;
            const todayStr = new Date().toISOString().split('T')[0];

            let html = '';
            sortedDates.forEach(date => {
                html += renderTaskSheetRow(date, dateGroups, columns, weekdays, todayStr, false);
            });
            const filledDateCount = sortedDates.filter(date => dateGroups[date].length > 0).length;
            
            document.getElementById('taskSheetBody').innerHTML = html;
            document.getElementById('taskFilledCount').textContent = filledRecords.length + taskOtherServices.length;
            document.getElementById('taskDateCount').textContent = filledDateCount;
        }

        function formatDateShort(dateStr) {
            if (!dateStr) return '';
            const d = parseLocalDateString(dateStr);
            return `${d.getMonth() + 1}月${d.getDate()}日`;
        }

        // ============================================================
        // 编辑模式专属函数存根（在 edit.js 中会被覆盖）
        // 这些存根确保 index.html（只读模式）中不会报错
        // ============================================================
        function handleEventAction(id, action) {
            if (isReadOnly) return;
        }

        function deleteOtherService(id) {
            if (isReadOnly) return;
        }

        function renderSchedule() {
            scheduleData.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            const dateGroups = {};
            scheduleData.forEach(item => {
                if (!dateGroups[item.date]) {
                    dateGroups[item.date] = [];
                }
                dateGroups[item.date].push(item);
            });
            
            let html = '';
            const columns = ['800', '1800', '南大堂', '外场转播'];
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const todayStr = new Date().toISOString().split('T')[0];

            // 分离过去日期和今天及以后的日期
            const allDates = Object.keys(dateGroups).sort();
            const pastDates = allDates.filter(d => d < todayStr);
            const futureDates = allDates.filter(d => d >= todayStr);

            // 渲染过去的日期（折叠）
            if (pastDates.length > 0) {
                html += `<tr class="past-toggle-row" id="pastToggleRow" onclick="togglePastDates()">
                    <td colspan="5"><span class="toggle-icon">▶</span>历史预约（${pastDates.length} 天）</td>
                </tr>`;
                pastDates.forEach(date => {
                    html += renderScheduleRow(date, dateGroups, columns, weekdays, todayStr, true);
                });
            }

            // 渲染今天及以后的日期
            futureDates.forEach(date => {
                html += renderScheduleRow(date, dateGroups, columns, weekdays, todayStr, false);
            });
            
            document.getElementById('scheduleBody').innerHTML = html;
        }

        // 切换历史日期显示/隐藏
        function togglePastDates() {
            const toggleRow = document.getElementById('pastToggleRow');
            const isExpanded = toggleRow.classList.contains('expanded');
            const pastRows = document.querySelectorAll('.past-date-row');
            if (isExpanded) {
                toggleRow.classList.remove('expanded');
                toggleRow.querySelector('.toggle-icon').textContent = '▶';
                pastRows.forEach(r => r.classList.remove('visible'));
            } else {
                toggleRow.classList.add('expanded');
                toggleRow.querySelector('.toggle-icon').textContent = '▼';
                pastRows.forEach(r => r.classList.add('visible'));
            }
        }

        // 渲染单行
        function renderScheduleRow(date, dateGroups, columns, weekdays, todayStr, isPast) {
            const isToday = date === todayStr;
            let rowHtml = `<tr ${isToday ? 'class="today-row" id="todayRow"' : ''} ${isPast ? 'class="past-date-row"' : ''}>`;
            
            const dateObj = new Date(date);
            const dateStr = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
            const weekdayStr = weekdays[dateObj.getDay()];
            
            rowHtml += `<td class="date-cell">${dateStr}${isToday ? '<br><span style="font-size: 10px; color: #4338ca;">今天</span>' : ''}<br><span class="weekday">${weekdayStr}</span></td>`;
            
            columns.forEach(col => {
                const colItems = dateGroups[date].filter(item => item.studio === col);
                
                if (colItems.length > 0) {
                    let cellContent = '';
                    colItems.forEach((item, idx) => {
                        let statusClass = '';
                        let statusText = '';
                        
                        if (item.status === 'filled') {
                            statusClass = 'filled';
                            statusText = '(已确认)';
                        } else if (item.status === 'filled_cancelled') {
                            statusClass = 'filled cancelled';
                            statusText = '(已确认)';
                        } else if (item.status === 'cancelled') {
                            statusClass = 'cancelled';
                            statusText = '(已取消)';
                        }
                        
                        const isOutside = item.type === 'outside';
                        cellContent += `<div class="event-cell ${statusClass} ${isOutside ? 'outside-event' : ''}" onclick="handleEventAction('${item.id}', 'fill')">
                            <div class="event-title">${item.programName} ${statusText}</div>
                            <div class="event-info-row">
                                <span class="event-info">${item.department}</span>
                                <span class="event-info">${item.applicant}</span>
                            </div>
                            ${isOutside && item.broadcastSystem ? `<div class="broadcast-highlight">${item.broadcastSystem}</div>` : ''}
                            ${isOutside && item.projectLocation ? `<div class="event-info">项目地点：${item.projectLocation}</div>` : ''}
                            ${item.other ? `<div class="event-info">${item.other}</div>` : ''}
                            <div class="event-actions">
                                ${item.status === 'cancelled' || item.status === 'filled_cancelled' ? `<button class="btn btn-small btn-cancel-small" onclick="event.stopPropagation(); handleEventAction('${item.id}', 'cancel')">恢复</button>` : `${item.status === 'filled' ? `<button class="btn btn-small btn-cancel-small" onclick="event.stopPropagation(); handleEventAction('${item.id}', 'cancel')">取消</button><button class="btn btn-small btn-edit-small" onclick="event.stopPropagation(); handleEventAction('${item.id}', 'edit')">编辑</button><button class="btn btn-small btn-back-small" onclick="event.stopPropagation(); handleEventAction('${item.id}', 'back')">返回</button>` : `<button class="btn btn-small btn-cancel-small" onclick="event.stopPropagation(); handleEventAction('${item.id}', 'cancel')">取消</button><button class="btn btn-small btn-fill-small" onclick="event.stopPropagation(); handleEventAction('${item.id}', 'fill')">填单</button><button class="btn btn-small btn-edit-small" onclick="event.stopPropagation(); handleEventAction('${item.id}', 'edit')">编辑</button><button class="btn btn-small btn-delete-small" onclick="event.stopPropagation(); handleEventAction('${item.id}', 'delete')">删除</button>`}`}
                            </div>
                        </div>`;
                        
                        if (idx < colItems.length - 1) {
                            cellContent += '<div class="event-divider"></div>';
                        }
                    });
                    rowHtml += `<td>${cellContent}</td>`;
                } else {
                    rowHtml += '<td class="empty-cell"></td>';
                }
            });
            
            rowHtml += '</tr>';
            return rowHtml;
        }

        // 页面加载时检查云端状态并渲染
        checkCloudStatus();

        // ========== 下载排期表Excel ==========
        function downloadScheduleExcel() {
            if (typeof XLSX === 'undefined') {
                alert('Excel生成库加载失败，请刷新页面重试');
                return;
            }
            if (!scheduleData || scheduleData.length === 0) {
                alert('暂无排期数据可导出');
                return;
            }

            const columns = ['800', '1800', '南大堂', '外场转播'];
            const columnHeaders = ['日期', '800演播室', '1800演播室', '南大堂', '外场转播活动'];
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

            // 按日期分组
            const dateGroups = {};
            scheduleData.forEach(item => {
                if (!dateGroups[item.date]) dateGroups[item.date] = [];
                dateGroups[item.date].push(item);
            });

            const sortedDates = Object.keys(dateGroups).sort();
            const rows = [];

            // 表头
            rows.push(columnHeaders);

            sortedDates.forEach(date => {
                const dateObj = new Date(date);
                const dateStr = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日 ${weekdays[dateObj.getDay()]}`;
                const row = [dateStr];

                columns.forEach(col => {
                    const colItems = dateGroups[date].filter(item => item.studio === col);
                    if (colItems.length > 0) {
                        const cellTexts = colItems.map(item => {
                            let statusText = '';
                            if (item.status === 'filled') statusText = '(已确认)';
                            else if (item.status === 'filled_cancelled') statusText = '(已确认)';
                            else if (item.status === 'cancelled') statusText = '(已取消)';

                            let text = item.programName + ' ' + statusText;
                            if (item.department || item.applicant) {
                                text += '\n' + (item.department || '') + ' ' + (item.applicant || '');
                            }
                            // 外场转播：加转播系统前缀
                            if (item.type === 'outside' && item.broadcastSystem) {
                                text = item.broadcastSystem + ': ' + text;
                            }
                            // 外场项目地点
                            if (item.type === 'outside' && item.projectLocation) {
                                text += '\n项目地点: ' + item.projectLocation;
                            }
                            // 其他备注
                            if (item.other) {
                                text += '\n' + item.other;
                            }
                            return text;
                        });
                        row.push(cellTexts.join('\n\n'));
                    } else {
                        row.push('');
                    }
                });

                rows.push(row);
            });

            const ws = XLSX.utils.aoa_to_sheet(rows);

            // 设置列宽
            ws['!cols'] = [
                { wch: 20 },
                { wch: 30 },
                { wch: 30 },
                { wch: 25 },
                { wch: 35 }
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, '排期表');

            const today = new Date();
            const fileName = `排期表_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.xlsx`;
            XLSX.writeFile(wb, fileName);
        }

        // ========== 部门周排班 ==========
        const SHIFT_TYPES = ['800', '1800', '南大堂', '外场转播', '外勤及其他', '设备收发', '直播', '行政值班'];
        const SHIFT_DEPARTMENT_CONFIG = [
            {
                name: '融合制作部',
                groups: ['融合制作']
            },
            {
                name: '视听艺术部',
                groups: ['灯光', '音响', '舞美']
            },
            {
                name: '转播技术部',
                groups: ['视频', '音频', '特种', '制作']
            },
            {
                name: '资产运营部',
                groups: ['资产运营']
            },
            {
                name: '直播部',
                groups: ['白班', '晚班']
            },
            {
                name: '综合统筹部',
                groups: ['统筹', '商务']
            }
        ];
        const SHIFT_GROUP_CONFIG = SHIFT_DEPARTMENT_CONFIG.flatMap(department =>
            department.groups.map(groupName => ({
                key: `${department.name}__${groupName}`,
                department: department.name,
                groupName
            }))
        );
        let shiftData = { weekSchedules: [], updateTime: null };
        let selectedShiftWeekStart = getNextWeekMondayString();
        let selectedShiftDepartment = SHIFT_DEPARTMENT_CONFIG[0].name;

        function formatShiftDateShort(dateStr) {
            const date = parseLocalDateString(dateStr);
            return `${date.getMonth() + 1}月${date.getDate()}日`;
        }

        function getWeekStartFromDate(dateStr) {
            const date = parseLocalDateString(dateStr);
            const day = date.getDay();
            const diff = day === 0 ? -6 : (1 - day);
            const monday = new Date(date);
            monday.setDate(date.getDate() + diff);
            return formatLocalDateString(monday);
        }

        function getShiftWeekDates(weekStart = selectedShiftWeekStart) {
            return getWeekDatesByStart(weekStart);
        }

        function formatShiftWeekRange(weekStart = selectedShiftWeekStart) {
            const dates = getShiftWeekDates(weekStart);
            return `${formatShiftDateShort(dates[0])} - ${formatShiftDateShort(dates[6])}`;
        }

        function getShiftGroupConfig(groupKey) {
            return SHIFT_GROUP_CONFIG.find(item => item.key === groupKey) || null;
        }

        function getShiftDepartmentGroups(name) {
            const department = SHIFT_DEPARTMENT_CONFIG.find(item => item.name === name);
            return department ? [...department.groups] : [];
        }

        function buildEmptyShiftRecord(date, shiftType, groupKey) {
            const group = getShiftGroupConfig(groupKey);
            return {
                weekStart: getWeekStartFromDate(date),
                date,
                shiftType,
                department: group ? group.department : '',
                groupKey,
                groupName: group ? group.groupName : '',
                assignees: []
            };
        }

        function normalizeShiftRecord(record) {
            if (!record || !record.date || !record.shiftType) return null;
            if (!record.groupKey) {
                return null;
            }
            const group = getShiftGroupConfig(record.groupKey);
            if (!group) return null;
            const normalizedShiftType = record.shiftType === '外场' ? '外场转播' : record.shiftType;

            return {
                weekStart: record.weekStart || getWeekStartFromDate(record.date),
                date: record.date,
                shiftType: normalizedShiftType,
                department: group.department,
                groupKey: group.key,
                groupName: group.groupName,
                assignees: [...new Set(Array.isArray(record.assignees) ? record.assignees.filter(Boolean) : [])]
            };
        }

        function normalizeShiftData(data) {
            const normalized = {
                weekSchedules: [],
                updateTime: data && data.updateTime ? data.updateTime : null
            };

            if (data && Array.isArray(data.weekSchedules)) {
                const records = [];
                data.weekSchedules.forEach(item => {
                    if (item && item.groupKey) {
                        const normalizedItem = normalizeShiftRecord(item);
                        if (normalizedItem) records.push(normalizedItem);
                        return;
                    }

                    if (item && Array.isArray(item.roles) && item.department) {
                        item.roles.forEach(role => {
                            if (!role || !role.name) return;
                            const groupKey = `${item.department}__${role.name}`;
                            const assignees = Array.isArray(role.assignees) ? role.assignees.filter(Boolean) : [];
                            if (!role.required && assignees.length === 0) return;
                            const normalizedItem = normalizeShiftRecord({
                                weekStart: item.weekStart,
                                date: item.date,
                                shiftType: item.shiftType === '外场' ? '外场转播' : item.shiftType,
                                groupKey,
                                assignees
                            });
                            if (normalizedItem) records.push(normalizedItem);
                        });
                    }
                });
                normalized.weekSchedules = records;
            }

            return normalized;
        }

        function getShiftRecord(date, shiftType, groupKey) {
            return shiftData.weekSchedules.find(item =>
                item.date === date &&
                item.shiftType === shiftType &&
                item.groupKey === groupKey
            ) || null;
        }

        function getOrCreateShiftRecord(date, shiftType, groupKey) {
            let record = getShiftRecord(date, shiftType, groupKey);
            if (!record) {
                record = buildEmptyShiftRecord(date, shiftType, groupKey);
                shiftData.weekSchedules.push(record);
            }
            return record;
        }

        function getShiftAssignedPeople(record) {
            if (!record || !Array.isArray(record.assignees)) return [];
            return [...record.assignees];
        }

        function getShiftTaskItems(date, shiftType) {
            const filledRecords = scheduleData.filter(item => item.status === 'filled' && item.date === date);
            if (shiftType === '800') {
                return filledRecords.filter(item => item.studio === '800');
            }
            if (shiftType === '1800') {
                return filledRecords.filter(item => item.studio === '1800');
            }
            if (shiftType === '南大堂') {
                return filledRecords.filter(item => item.studio === '南大堂');
            }
            if (shiftType === '外场转播') {
                return filledRecords.filter(item => item.type === 'outside');
            }
            if (shiftType === '外勤及其他') {
                return expandOtherServices(otherServices).filter(service => service.date === date);
            }
            return [];
        }

        function getShiftTaskSummary(date, shiftType) {
            const tasks = getShiftTaskItems(date, shiftType);
            if (tasks.length === 0) return '-';
            return tasks.map((item, idx) => {
                let html = renderTaskItemContent(item, date);
                if (idx < tasks.length - 1) {
                    html += '<div class="event-divider" style="border-top: 1px solid #ddd; margin: 8px 0;"></div>';
                }
                return html;
            }).join('');
        }

        function getShiftTaskProgramNames(date, shiftType) {
            const tasks = getShiftTaskItems(date, shiftType);
            if (tasks.length === 0) return '-';
            return tasks.map(item => item.programName || '').filter(Boolean).join(' / ') || '-';
        }

        function getShiftSummaryText(record) {
            const people = getShiftAssignedPeople(record);
            return people.length > 0 ? people.join('、') : '-';
        }

        function renderShiftSummaryTable() {
            const dates = getShiftWeekDates();
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const weekLabel = document.getElementById('shiftWeekLabel');
            if (weekLabel) weekLabel.textContent = `排班周：${formatShiftWeekRange()}`;
            const currentWeekBtn = document.getElementById('shiftCurrentWeekBtn');
            const nextWeekBtn = document.getElementById('shiftNextWeekBtn');
            if (currentWeekBtn) currentWeekBtn.classList.toggle('active', selectedShiftWeekStart === getCurrentWeekMondayString());
            if (nextWeekBtn) nextWeekBtn.classList.toggle('active', selectedShiftWeekStart === getNextWeekMondayString());
            const deptSelect = document.getElementById('shiftDepartmentSelect');
            const editBtn = document.getElementById('shiftEditDepartmentBtn');
            if (deptSelect) {
                deptSelect.innerHTML = SHIFT_DEPARTMENT_CONFIG.map(item => `<option value="${item.name}">${item.name}</option>`).join('');
                deptSelect.value = selectedShiftDepartment;
            }
            if (editBtn) {
                editBtn.style.display = isReadOnly ? 'none' : 'inline-block';
            }

            let html = '<table class="task-sheet-table shift-board-table shift-summary-table"><thead>';
            html += '<tr><th rowspan="2" style="width: 76px;">日期</th><th rowspan="2" style="width: 68px;">班次</th><th rowspan="2" style="width: 170px;">任务</th>';
            SHIFT_DEPARTMENT_CONFIG.forEach(department => {
                html += `<th colspan="${department.groups.length}">${department.name}</th>`;
            });
            html += '</tr><tr>';
            SHIFT_DEPARTMENT_CONFIG.forEach(department => {
                department.groups.forEach(groupName => {
                    html += `<th class="shift-group-header">${groupName}</th>`;
                });
            });
            html += '</tr></thead><tbody>';

            dates.forEach(date => {
                const d = parseLocalDateString(date);
                SHIFT_TYPES.forEach((shiftType, shiftIndex) => {
                    html += '<tr>';
                    if (shiftIndex === 0) {
                        html += `<td class="date-cell shift-date-main" rowspan="${SHIFT_TYPES.length}">${formatShiftDateShort(date)}<span class="weekday">${weekdays[d.getDay()]}</span></td>`;
                    }
                    html += `<td class="date-cell shift-type-cell">${shiftType}</td>`;
                    html += `<td class="shift-task-cell task-cell ${getShiftTaskItems(date, shiftType).length > 0 ? 'has-content' : ''}">${getShiftTaskSummary(date, shiftType)}</td>`;
                    SHIFT_GROUP_CONFIG.forEach(group => {
                        const record = getShiftRecord(date, shiftType, group.key);
                        html += `<td class="shift-summary-cell">${escapeExcelCell(getShiftSummaryText(record))}</td>`;
                    });
                    html += '</tr>';
                });
            });

            html += '</tbody></table>';
            return html;
        }

        function renderShiftDepartmentEditor(departmentName = selectedShiftDepartment) {
            const department = SHIFT_DEPARTMENT_CONFIG.find(item => item.name === departmentName) || SHIFT_DEPARTMENT_CONFIG[0];
            const dates = getShiftWeekDates();
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            let html = '<table class="task-sheet-table shift-board-table shift-dept-table"><thead>';
            html += '<tr><th rowspan="2" style="width: 76px;">日期</th><th rowspan="2" style="width: 68px;">班次</th><th rowspan="2" style="width: 240px;">任务</th>';
            html += `<th colspan="${department.groups.length}">${department.name}</th></tr><tr>`;
            department.groups.forEach(groupName => {
                html += `<th class="shift-group-header">${groupName}</th>`;
            });
            html += '</tr></thead><tbody>';

            dates.forEach(date => {
                const d = parseLocalDateString(date);
                SHIFT_TYPES.forEach((shiftType, shiftIndex) => {
                    html += '<tr>';
                    if (shiftIndex === 0) {
                        html += `<td class="date-cell shift-date-main" rowspan="${SHIFT_TYPES.length}">${formatShiftDateShort(date)}<span class="weekday">${weekdays[d.getDay()]}</span></td>`;
                    }
                    html += `<td class="date-cell shift-type-cell">${shiftType}</td>`;
                    html += `<td class="shift-task-cell task-cell ${getShiftTaskItems(date, shiftType).length > 0 ? 'has-content' : ''}">${getShiftTaskSummary(date, shiftType)}</td>`;
                    department.groups.forEach(groupName => {
                        const groupKey = `${department.name}__${groupName}`;
                        const record = getShiftRecord(date, shiftType, groupKey);
                        const selectedPeople = getShiftAssignedPeople(record);
                        html += `
                            <td class="shift-input-cell" data-date="${date}" data-shift-type="${shiftType}" data-group-key="${groupKey}">
                                <textarea
                                    class="shift-manual-input"
                                    data-date="${date}"
                                    data-shift-type="${shiftType}"
                                    data-group-key="${groupKey}"
                                    placeholder="输入人名"
                                >${escapeExcelCell(selectedPeople.join('、'))}</textarea>
                            </td>
                        `;
                    });
                    html += '</tr>';
                });
            });

            html += '</tbody></table>';
            return html;
        }

        function changeShiftDepartment(value) {
            selectedShiftDepartment = value;
        }

        function changeShiftWeek(type) {
            selectedShiftWeekStart = type === 'current' ? getCurrentWeekMondayString() : getNextWeekMondayString();
            renderShiftBoard();
        }

        function showShiftBoard() {
            showPage('page-shift');
            loadShiftsFromCOS().then(() => {
                renderShiftBoard();
            });
        }

        async function loadShiftsFromCOS() {
            try {
                const result = await cos.getObject({
                    Bucket: COS_CONFIG._b1,
                    Region: COS_CONFIG._r1,
                    Key: 'data/shifts.json'
                });
                const data = JSON.parse(cosBodyToString(result.Body));
                shiftData = normalizeShiftData(data);
                return true;
            } catch (err) {
                console.log('排班数据加载失败（可能首次运行）:', err);
                shiftData = normalizeShiftData({});
                return false;
            }
        }

        function escapeExcelCell(value) {
            return String(value === undefined || value === null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function exportShiftBoard() {
            const dates = getShiftWeekDates();
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const headers = ['日期', '班次', '节目'];
            SHIFT_GROUP_CONFIG.forEach(group => {
                headers.push(`${group.department}-${group.groupName}`);
            });

            let html = '<html><head><meta charset="utf-8"></head><body>';
            html += `<h3>部门排班 ${escapeExcelCell(formatShiftWeekRange())}</h3>`;
            html += '<table border="1"><thead><tr>';
            headers.forEach(header => {
                html += `<th>${escapeExcelCell(header)}</th>`;
            });
            html += '</tr></thead><tbody>';

            dates.forEach(date => {
                const d = parseLocalDateString(date);
                SHIFT_TYPES.forEach(shiftType => {
                    html += '<tr>';
                    html += `<td>${escapeExcelCell(`${formatShiftDateShort(date)} ${weekdays[d.getDay()]}`)}</td>`;
                    html += `<td>${escapeExcelCell(shiftType)}</td>`;
                    html += `<td>${escapeExcelCell(getShiftTaskProgramNames(date, shiftType))}</td>`;
                    SHIFT_GROUP_CONFIG.forEach(group => {
                        const record = getShiftRecord(date, shiftType, group.key);
                        html += `<td>${escapeExcelCell(getShiftSummaryText(record))}</td>`;
                    });
                    html += '</tr>';
                });
            });

            html += '</tbody></table></body></html>';

            const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `部门排班_${selectedShiftWeekStart}.xls`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 0);
        }

        function renderShiftBoard() {
            const container = document.getElementById('shiftBoardContainer');
            if (!container) return;
            container.innerHTML = renderShiftSummaryTable();
        }

        // 以下函数在 edit.js 中覆盖（编辑模式），只读模式下为空操作
        function openShiftDepartmentModal() {}
        function closeShiftModal() {}
        function addOtherService() {}
        function generateCurrentWeeklyTaskSheet() {}
        function generateWeeklyTaskSheet() {}
        function addStaff() {}
        function removeStaff() {}
        function saveShifts() {}
        function updateStaffPhone() {}
