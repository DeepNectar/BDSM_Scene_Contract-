        (function() {
            // Hide header logo gracefully if the remote image fails to load
            const headerLogo = document.querySelector('.header-logo');
            if (headerLogo) {
                headerLogo.addEventListener('error', () => {
                    headerLogo.style.display = 'none';
                });
            }

            // Floating hearts
            function createFloatingParticles() {
                const symbols = ['♥', '♡', '✧', '✦', '♢', '♤', '❤', '💕', '💖'];
                for (let i = 0; i < 25; i++) {
                    const el = document.createElement('div');
                    el.className = 'floating-particle';
                    el.textContent = symbols[i % symbols.length];
                    el.style.left = Math.random() * 100 + 'vw';
                    el.style.fontSize = (15 + Math.random() * 35) + 'px';
                    el.style.animationDuration = (12 + Math.random() * 20) + 's';
                    el.style.animationDelay = (Math.random() * 25) + 's';
                    el.style.opacity = 0.04 + Math.random() * 0.09;
                    el.style.transform = `rotate(${Math.random() * 360}deg)`;
                    document.body.appendChild(el);
                }
            }
            createFloatingParticles();

            // LOGIN
            const overlay = document.getElementById('login-overlay');
            const passwordInput = document.getElementById('password-input');
            const loginBtn = document.getElementById('login-btn');
            const errorDiv = document.getElementById('login-error');
            const toggleBtn = document.getElementById('toggle-password');
            const correctPassword = 'Deepnectar@1612@';

            toggleBtn.addEventListener('click', function() {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                this.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
            });

            function tryLogin() {
                const entered = passwordInput.value.trim();
                if (entered === correctPassword) {
                    overlay.classList.add('hidden');
                    errorDiv.textContent = '';
                } else {
                    errorDiv.textContent = '❌ Incorrect password. Please try again.';
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            }

            loginBtn.addEventListener('click', tryLogin);
            passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });

            // Clear day data
            function clearDayData(dayId) {
                const page = document.getElementById(dayId);
                if (!page) return;
                const inputs = page.querySelectorAll('input:not([type="password"]), textarea, select');
                inputs.forEach(el => {
                    if (el.type === 'checkbox') {
                        el.checked = false;
                    } else if (el.tagName === 'SELECT') {
                        if (!el.classList.contains('day-finished-select')) {
                            el.selectedIndex = 0;
                        }
                    } else {
                        el.value = '';
                    }
                });
                const finishedSelect = page.querySelector('.day-finished-select');
                if (finishedSelect) {
                    finishedSelect.value = 'no';
                }
                alert(`✅ Data for ${dayId.toUpperCase()} has been cleared.`);
            }

            document.querySelectorAll('.clear-day-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const dayId = this.getAttribute('data-day');
                    if (confirm(`Are you sure you want to clear ALL data for ${dayId.toUpperCase()}?`)) {
                        clearDayData(dayId);
                    }
                });
            });

            // Auto-expand textareas
            document.querySelectorAll('textarea').forEach(textarea => {
                textarea.addEventListener('input', function() {
                    this.style.minHeight = '60px';
                    this.style.height = 'auto';
                    this.style.height = this.scrollHeight + 'px';
                });
                setTimeout(() => {
                    if (textarea.value) {
                        textarea.style.height = 'auto';
                        textarea.style.height = textarea.scrollHeight + 'px';
                    }
                }, 100);
            });

            // Auto-expand inputs
            document.querySelectorAll('td input[type="text"], td .inline-input, .auto-expand').forEach(input => {
                if (input.closest('.datetime-group')) return;
                function autoExpandInput(el) {
                    const temp = document.createElement('span');
                    temp.style.visibility = 'hidden';
                    temp.style.position = 'absolute';
                    temp.style.whiteSpace = 'pre';
                    temp.style.fontSize = window.getComputedStyle(el).fontSize;
                    temp.style.fontFamily = window.getComputedStyle(el).fontFamily;
                    temp.textContent = el.value || el.placeholder || '';
                    document.body.appendChild(temp);
                    const width = temp.offsetWidth + 25;
                    document.body.removeChild(temp);
                    if (width > 60) {
                        el.style.width = Math.min(width, 400) + 'px';
                    } else {
                        el.style.width = 'auto';
                        el.style.minWidth = '60px';
                    }
                }
                input.addEventListener('input', function() {
                    autoExpandInput(this);
                });
                setTimeout(() => {
                    if (input.value) {
                        autoExpandInput(input);
                    }
                }, 100);
            });

            // Save
            document.getElementById('save-contract').addEventListener('click', function() {
                const inputs = document.querySelectorAll('input:not([type="password"]), textarea, select');
                const data = {};
                inputs.forEach((el, idx) => {
                    if (el.type === 'checkbox') {
                        data[el.id || `chk-${idx}`] = el.checked;
                    } else if (el.type === 'select-one') {
                        data[el.id || el.className || `sel-${idx}`] = el.value;
                    } else {
                        const key = el.placeholder || el.name || `field-${idx}`;
                        data[key] = el.value;
                    }
                });
                const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
                allCheckboxes.forEach((cb, i) => {
                    data[`cb-${i}`] = cb.checked;
                });
                document.querySelectorAll('.day-finished-select').forEach(sel => {
                    data[`day-${sel.dataset.day}-finished`] = sel.value;
                });
                localStorage.setItem('bdsmContractData', JSON.stringify(data));
                alert('✅ Contract data saved locally.');
            });

            // Load
            function loadSaved() {
                const saved = localStorage.getItem('bdsmContractData');
                if (!saved) return;
                try {
                    const data = JSON.parse(saved);
                    const inputs = document.querySelectorAll('input:not([type="password"]), textarea, select');
                    const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
                    allCheckboxes.forEach((cb, i) => {
                        const key = `cb-${i}`;
                        if (data.hasOwnProperty(key)) {
                            cb.checked = data[key];
                        }
                    });
                    document.querySelectorAll('.day-finished-select').forEach(sel => {
                        const key = `day-${sel.dataset.day}-finished`;
                        if (data.hasOwnProperty(key)) {
                            sel.value = data[key];
                        }
                    });
                    let idx = 0;
                    inputs.forEach(el => {
                        if (el.type === 'checkbox') return;
                        if (el.type === 'select-one') {
                            const key = el.id || el.className || `sel-${idx}`;
                            if (data.hasOwnProperty(key)) {
                                el.value = data[key];
                            }
                        } else {
                            const key = el.placeholder || el.name || `field-${idx}`;
                            if (data.hasOwnProperty(key)) {
                                el.value = data[key];
                            }
                        }
                        idx++;
                    });
                } catch (e) { /* ignore */ }
            }

            const observer = new MutationObserver(() => {
                if (overlay.classList.contains('hidden')) {
                    loadSaved();
                    observer.disconnect();
                }
            });
            observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });

            if (overlay.classList.contains('hidden')) {
                loadSaved();
                observer.disconnect();
            }

            // Print
            document.getElementById('print-pdf').addEventListener('click', function() {
                window.print();
            });

            // ---- EMAIL MODAL ----
            const modal = document.getElementById('email-modal');
            const modalBody = document.getElementById('modal-body');
            const modalCloseBtn = document.getElementById('modal-close-btn');
            const modalCloseFooter = document.getElementById('modal-close-footer-btn');
            const modalCopyBtn = document.getElementById('modal-copy-btn');
            const modalEmailBtn = document.getElementById('modal-email-btn');
            const tabButtons = document.querySelectorAll('.modal-tabs button');
            let currentFormat = 'plain';
            let currentPlainText = '';
            let currentHtmlText = '';

            function closeModal() {
                modal.classList.remove('active');
            }

            modalCloseBtn.addEventListener('click', closeModal);
            modalCloseFooter.addEventListener('click', closeModal);
            modal.addEventListener('click', function(e) {
                if (e.target === this) closeModal();
            });

            tabButtons.forEach(btn => {
                btn.addEventListener('click', function() {
                    tabButtons.forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    currentFormat = this.dataset.format;
                    renderModalContent();
                });
            });

            function renderModalContent() {
                if (currentFormat === 'plain') {
                    modalBody.textContent = currentPlainText;
                    modalBody.className = 'modal-body';
                } else {
                    modalBody.innerHTML = currentHtmlText;
                    modalBody.className = 'modal-body html-body';
                }
            }

            // Build email content
            function buildEmailContent() {
                const finishedDays = [];
                document.querySelectorAll('.day-finished-select').forEach(sel => {
                    if (sel.value === 'yes') {
                        finishedDays.push(sel.dataset.day);
                    }
                });

                if (finishedDays.length === 0) {
                    alert('⚠️ No days marked as completed. Please mark days as "Yes" in the Day Finished selector before emailing.');
                    return null;
                }

                // --- PLAIN TEXT ---
                let plain = '';
                plain += '========================================\n';
                plain += '   BDSM SCENE CONTRACT - COMPLETED DAYS\n';
                plain += '========================================\n\n';
                plain += 'Exported: ' + new Date().toLocaleString() + '\n';
                plain += 'Completed Days: ' + finishedDays.join(', ').toUpperCase() + '\n';
                plain += '========================================\n\n';

                // --- HTML ---
                let html = '<div style="font-family: Georgia, \'Times New Roman\', serif; max-width: 800px; margin: 0 auto; background: #fcf7f0; padding: 30px 35px; border-radius: 16px; border: 1px solid #b8a79b; color: #2a1c16;">';
                html += '<div style="text-align: center; border-bottom: 3px double #b7a094; padding-bottom: 15px; margin-bottom: 25px;">';
                html += '<h1 style="font-size: 28px; font-weight: 300; letter-spacing: 3px; font-family: Georgia, serif; color: #241b17; margin: 0 0 8px 0;">BDSM SCENE CONTRACT</h1>';
                html += '<p style="color: #3f322b; font-size: 14px; margin: 0;">📅 Exported: ' + new Date().toLocaleString() + '</p>';
                html += '<p style="color: #3f322b; font-size: 14px; margin: 4px 0 0 0;">✅ Completed Days: <strong>' + finishedDays.join(', ').toUpperCase() + '</strong></p>';
                html += '</div>';

                function getDateFromGroup(group) {
                    if (!group) return '';
                    const inputs = group.querySelectorAll('input');
                    const vals = Array.from(inputs).map(inp => inp.value || inp.placeholder);
                    if (vals.length >= 3) {
                        const clean = vals.filter(v => v && v !== 'DD' && v !== 'MM' && v !== 'YYYY' && v !== 'HH' && v !== 'MM');
                        if (clean.length >= 3) {
                            const d = clean[0] !== 'DD' && clean[0] !== '' ? clean[0] : '';
                            const m = clean[1] !== 'MM' && clean[1] !== '' ? clean[1] : '';
                            const y = clean[2] !== 'YYYY' && clean[2] !== '' ? clean[2] : '';
                            if (d && m && y) return d + '/' + m + '/' + y;
                            return clean.join('/');
                        }
                        if (clean.length === 2) {
                            const h = clean[0] !== 'HH' && clean[0] !== '' ? clean[0] : '';
                            const m = clean[1] !== 'MM' && clean[1] !== '' ? clean[1] : '';
                            if (h && m) return h + ':' + m;
                            return clean.join(':');
                        }
                        return vals.join('/');
                    }
                    return '';
                }

                function getInputValue(el) {
                    if (!el) return '';
                    if (el.tagName === 'TEXTAREA') return el.value;
                    if (el.tagName === 'INPUT') {
                        if (el.type === 'checkbox') return el.checked ? 'Yes' : 'No';
                        return el.value;
                    }
                    if (el.tagName === 'SELECT') return el.value;
                    return '';
                }

                function escapeHtml(text) {
                    if (!text) return '';
                    const div = document.createElement('div');
                    div.textContent = text;
                    return div.innerHTML;
                }

                finishedDays.forEach(dayId => {
                    const page = document.getElementById(dayId);
                    if (!page) return;

                    const titleEl = page.querySelector('h2');
                    const pageTitle = titleEl ? titleEl.textContent.trim() : dayId.toUpperCase();

                    plain += '╔══════════════════════════════════════════════════╗\n';
                    plain += '║  ✅ ' + pageTitle + ' - COMPLETED\n';
                    plain += '╚══════════════════════════════════════════════════╝\n\n';

                    html += '<div style="margin-bottom: 35px; padding: 15px 20px; background: rgba(252, 247, 240, 0.8); border-radius: 12px; border-left: 4px solid #b19787;">';
                    html += '<h2 style="font-family: Georgia, serif; font-weight: 400; color: #2a1c16; margin: 0 0 10px 0; font-size: 20px;">✅ ' + escapeHtml(pageTitle) + '</h2>';

                    let dayData = [];

                    // Signatures
                    const signRows = page.querySelectorAll('.sign-row');
                    signRows.forEach(row => {
                        const labels = row.querySelectorAll('label');
                        const inputs = row.querySelectorAll('input:not([type="checkbox"])');
                        labels.forEach((label, i) => {
                            if (inputs[i] && !inputs[i].closest('.datetime-group')) {
                                const val = inputs[i].value.trim();
                                if (val && val !== 'Honey' && val !== 'Deep' && val !== 'Signature' && val !== '') {
                                    dayData.push({ label: label.textContent.trim(), value: val });
                                }
                            }
                        });
                        const dateGroups = row.querySelectorAll('.datetime-group');
                        dateGroups.forEach(dg => {
                            const dateStr = getDateFromGroup(dg);
                            if (dateStr && dateStr !== 'DD/MM/YYYY' && dateStr !== '//' && dateStr !== ':' && dateStr !== '') {
                                const label = dg.closest('.sign-field')?.querySelector('label')?.textContent || 'Date';
                                dayData.push({ label: label, value: dateStr });
                            }
                        });
                    });

                    // Special Requests
                    const requests = page.querySelectorAll('.section-title + p');
                    requests.forEach(p => {
                        const strong = p.querySelector('strong');
                        if (strong && (strong.textContent.includes('Submissive') || strong.textContent.includes('Dominant'))) {
                            const text = p.textContent.replace(strong.textContent, '').trim();
                            if (text && text !== '') {
                                dayData.push({ label: strong.textContent.trim(), value: text });
                            }
                        }
                    });

                    // Debrief
                    const debriefGrids = page.querySelectorAll('.debrief-grid');
                    debriefGrids.forEach(grid => {
                        const labels = grid.querySelectorAll('label');
                        const inputs = grid.querySelectorAll('input, textarea');
                        labels.forEach((label, i) => {
                            if (inputs[i]) {
                                const val = getInputValue(inputs[i]);
                                if (val && val.trim() !== '') {
                                    dayData.push({ label: label.textContent.trim(), value: val });
                                }
                            }
                        });
                        const textareas = grid.querySelectorAll('textarea');
                        textareas.forEach(ta => {
                            const val = ta.value.trim();
                            if (val && val !== '') {
                                const label = ta.closest('.full')?.querySelector('label')?.textContent || 'Debrief Notes';
                                dayData.push({ label: label, value: val });
                            }
                        });
                    });

                    // Safeword verification
                    const safewordTables = page.querySelectorAll('table');
                    safewordTables.forEach(table => {
                        const prevH4 = table.previousElementSibling;
                        if (prevH4 && prevH4.tagName === 'H4' && prevH4.textContent.includes('SAFEWORD VERIFICATION')) {
                            const rows = table.querySelectorAll('tr');
                            rows.forEach((row, ri) => {
                                if (ri === 0) return;
                                const cells = row.querySelectorAll('td');
                                if (cells.length >= 3) {
                                    const safeword = cells[0].textContent.trim();
                                    const subCbs = cells[1].querySelectorAll('input[type="checkbox"]');
                                    const domCbs = cells[2].querySelectorAll('input[type="checkbox"]');
                                    const subYes = subCbs[0]?.checked || false;
                                    const domYes = domCbs[0]?.checked || false;
                                    if (safeword) {
                                        dayData.push({ label: safeword + ' (Submissive)', value: subYes ? 'Yes' : 'No' });
                                        dayData.push({ label: safeword + ' (Dominant)', value: domYes ? 'Yes' : 'No' });
                                    }
                                }
                            });
                        }
                    });

                    // Checklist
                    const checklistItems = page.querySelectorAll('.checklist-item');
                    checklistItems.forEach(item => {
                        const cb = item.querySelector('input[type="checkbox"]');
                        const labelText = item.textContent.trim();
                        if (cb && cb.checked && labelText && labelText !== '') {
                            dayData.push({ label: '✓ ' + labelText, value: 'Yes' });
                        }
                    });

                    // Toy inventory
                    const toyTables = page.querySelectorAll('table');
                    toyTables.forEach(table => {
                        const prevH4 = table.previousElementSibling;
                        if (prevH4 && prevH4.tagName === 'H4' && prevH4.textContent.includes('TOY INVENTORY')) {
                            const rows = table.querySelectorAll('tr');
                            rows.forEach((row, ri) => {
                                if (ri === 0) return;
                                const cells = row.querySelectorAll('td');
                                if (cells.length >= 3) {
                                    const item = cells[0].textContent.trim();
                                    const locInput = cells[2].querySelector('input');
                                    const location = locInput ? locInput.value.trim() : cells[2].textContent.trim();
                                    const cleanCbs = cells[1].querySelectorAll('input[type="checkbox"]');
                                    let conditions = [];
                                    if (cleanCbs.length > 0 && cleanCbs[0]?.checked) conditions.push('Clean');
                                    if (cleanCbs.length > 1 && cleanCbs[1]?.checked) conditions.push(cleanCbs[1]?.nextSibling?.textContent?.trim() || 'Safe');
                                    if (conditions.length > 0 || location) {
                                        const condStr = conditions.length > 0 ? ' [' + conditions.join(', ') + ']' : '';
                                        const locStr = location && location !== '' && location !== '(empty)' ? ' → ' + location : '';
                                        dayData.push({ label: item, value: condStr + locStr });
                                    }
                                }
                            });
                        }
                    });

                    // Article 2: Parameters
                    const paramTables = page.querySelectorAll('table');
                    paramTables.forEach(table => {
                        const prevH3 = table.previousElementSibling;
                        if (prevH3 && prevH3.tagName === 'H3' && prevH3.textContent.includes('ARTICLE 2')) {
                            const rows = table.querySelectorAll('tr');
                            rows.forEach((row, ri) => {
                                if (ri === 0) return;
                                const cells = row.querySelectorAll('td');
                                if (cells.length >= 2) {
                                    const clause = cells[0].textContent.trim();
                                    let value = cells[1].textContent.trim();
                                    const dateGroup = cells[1].querySelector('.datetime-group');
                                    if (dateGroup) {
                                        const dateStr = getDateFromGroup(dateGroup);
                                        if (dateStr && dateStr !== 'DD/MM/YYYY' && dateStr !== '//' && dateStr !== ':' && dateStr !== '') {
                                            value = dateStr;
                                        }
                                    }
                                    if (value && value !== 'DD/MM/YYYY' && value !== 'HH:MM' && value !== '//' && value !== ':' && value !== '') {
                                        dayData.push({ label: clause, value: value });
                                    }
                                }
                            });
                        }
                    });

                    // Article 5: Hard Limits
                    const limitTables = page.querySelectorAll('table');
                    limitTables.forEach(table => {
                        const prevH3 = table.previousElementSibling;
                        if (prevH3 && prevH3.tagName === 'H3' && prevH3.textContent.includes('ARTICLE 5')) {
                            const rows = table.querySelectorAll('tr');
                            rows.forEach((row, ri) => {
                                if (ri === 0) return;
                                const cells = row.querySelectorAll('td');
                                if (cells.length >= 2) {
                                    const clause = cells[0].textContent.trim();
                                    const limit = cells[1].textContent.trim();
                                    if (clause && limit) {
                                        dayData.push({ label: clause, value: limit });
                                    }
                                }
                            });
                        }
                    });

                    // Article 6: Aftercare
                    const aftercareTables = page.querySelectorAll('table');
                    aftercareTables.forEach(table => {
                        const prevH3 = table.previousElementSibling;
                        if (prevH3 && prevH3.tagName === 'H3' && prevH3.textContent.includes('ARTICLE 6')) {
                            const rows = table.querySelectorAll('tr');
                            rows.forEach((row, ri) => {
                                if (ri === 0) return;
                                const cells = row.querySelectorAll('td');
                                if (cells.length >= 2) {
                                    const deliverable = cells[0].textContent.trim();
                                    const duration = cells[1].textContent.trim();
                                    if (deliverable && duration) {
                                        dayData.push({ label: deliverable, value: duration });
                                    }
                                }
                            });
                        }
                    });

                    // Output
                    if (dayData.length > 0) {
                        plain += '--- SCENE DATA ---\n';
                        html += '<div style="margin: 10px 0;">';
                        dayData.forEach(item => {
                            plain += '  ' + item.label + ': ' + item.value + '\n';
                            html += '<div style="padding: 4px 0; border-bottom: 1px solid #ede5de; font-size: 14px;">';
                            html += '<strong style="color: #3f2c22;">' + escapeHtml(item.label) + ':</strong> ';
                            html += '<span style="color: #2a1c16;">' + escapeHtml(item.value) + '</span>';
                            html += '</div>';
                        });
                        html += '</div>';
                        plain += '\n────────────────────────────────────────────\n\n';
                    } else {
                        plain += 'No custom data entered for this day.\n\n';
                    }

                    html += '</div>';
                });

                // Confidentiality footer
                plain += '========================================\n';
                plain += '   CONFIDENTIALITY NOTICE\n';
                plain += '   The information in this document is\n';
                plain += '   strictly private and confidential.\n';
                plain += '========================================\n';

                html += '<div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #d4c2b5; text-align: center; color: #4e3d33; font-size: 13px;">';
                html += '<p style="margin: 0;"><strong>CONFIDENTIALITY NOTICE</strong></p>';
                html += '<p style="margin: 4px 0 0 0;">The information in this document is strictly private and confidential.</p>';
                html += '</div>';
                html += '</div>';

                return { plain, html };
            }

            // Email button
            document.getElementById('email-contract').addEventListener('click', function() {
                const content = buildEmailContent();
                if (!content) return;
                currentPlainText = content.plain;
                currentHtmlText = content.html;
                renderModalContent();
                modal.classList.add('active');
            });

            // Copy button
            modalCopyBtn.addEventListener('click', function() {
                const text = currentFormat === 'plain' ? currentPlainText : currentHtmlText;
                navigator.clipboard.writeText(text).then(() => {
                    alert('✅ Copied to clipboard!');
                }).catch(() => {
                    // Fallback
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    alert('✅ Copied to clipboard!');
                });
            });

            // Email send button
            modalEmailBtn.addEventListener('click', function() {
                const subject = encodeURIComponent('BDSM Contract Data - ' + new Date().toLocaleDateString());
                const body = encodeURIComponent(currentPlainText);
                window.open('mailto:?subject=' + subject + '&body=' + body, '_blank');
            });

            // Keyboard shortcut: ESC to close modal
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && modal.classList.contains('active')) {
                    closeModal();
                }
            });
        })();
    
