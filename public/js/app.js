// セミナー予約システム JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // フォームのバリデーション
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            if (!validateForm(this)) {
                e.preventDefault();
                return false;
            }
        });
    });
    
    // 電話番号のフォーマット
    const phoneInputs = document.querySelectorAll('input[type="tel"]');
    phoneInputs.forEach(input => {
        input.addEventListener('input', formatPhoneNumber);
    });
    
    // 管理画面：日付の制限
    const dateInput = document.getElementById('date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.min = today;
    }
    
    // 予約確認画面のコピー機能
    setupCopyFunctionality();
    
    // ローディング状態の管理
    setupLoadingStates();
});

// フォームバリデーション
function validateForm(form) {
    const requiredInputs = form.querySelectorAll('input[required], textarea[required]');
    let isValid = true;
    
    requiredInputs.forEach(input => {
        if (!input.value.trim()) {
            showFieldError(input, '必須項目です');
            isValid = false;
        } else {
            clearFieldError(input);
            
            // 特定フィールドのバリデーション
            if (input.type === 'tel') {
                if (!validatePhoneNumber(input.value)) {
                    showFieldError(input, '正しい電話番号を入力してください');
                    isValid = false;
                }
            }
            
            if (input.type === 'email') {
                if (!validateEmail(input.value)) {
                    showFieldError(input, '正しいメールアドレスを入力してください');
                    isValid = false;
                }
            }
        }
    });
    
    return isValid;
}

// フィールドエラーの表示
function showFieldError(input, message) {
    input.classList.add('error');
    
    // 既存のエラーメッセージを削除
    const existingError = input.parentNode.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // エラーメッセージを作成
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.color = '#dc3545';
    errorDiv.style.fontSize = '0.8rem';
    errorDiv.style.marginTop = '4px';
    
    input.parentNode.appendChild(errorDiv);
}

// フィールドエラーのクリア
function clearFieldError(input) {
    input.classList.remove('error');
    const errorMessage = input.parentNode.querySelector('.error-message');
    if (errorMessage) {
        errorMessage.remove();
    }
}

// 電話番号のバリデーション
function validatePhoneNumber(phone) {
    const phoneRegex = /^[\d\-\+\(\)\s]+$/;
    return phoneRegex.test(phone) && phone.length >= 10;
}

// メールアドレスのバリデーション
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// 電話番号のフォーマット
function formatPhoneNumber(e) {
    let value = e.target.value.replace(/[^\d]/g, '');
    
    if (value.length >= 6) {
        if (value.length <= 10) {
            value = value.replace(/(\d{2,4})(\d{2,4})(\d{2,4})/, '$1-$2-$3');
        } else {
            value = value.replace(/(\d{2,4})(\d{2,4})(\d{4})/, '$1-$2-$3');
        }
    }
    
    e.target.value = value;
}

// コピー機能のセットアップ
function setupCopyFunctionality() {
    const copyButtons = document.querySelectorAll('[data-copy]');
    copyButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-copy');
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                copyToClipboard(targetElement.value || targetElement.textContent);
                showToast('コピーしました！');
            }
        });
    });
}

// クリップボードにコピー
function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).catch(err => {
            console.error('コピーに失敗しました:', err);
            fallbackCopyTextToClipboard(text);
        });
    } else {
        fallbackCopyTextToClipboard(text);
    }
}

// フォールバックコピー機能
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
    } catch (err) {
        console.error('フォールバックコピーに失敗しました:', err);
    }
    
    document.body.removeChild(textArea);
}

// トースト通知の表示
function showToast(message, type = 'success', duration = 3000) {
    // 既存のトーストを削除
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // トーストのスタイル
    Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 24px',
        borderRadius: '8px',
        color: 'white',
        fontWeight: 'bold',
        zIndex: '1000',
        transform: 'translateX(100%)',
        transition: 'transform 0.3s ease',
        maxWidth: '300px',
        wordWrap: 'break-word'
    });
    
    // タイプ別の背景色
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    
    toast.style.backgroundColor = colors[type] || colors.success;
    
    document.body.appendChild(toast);
    
    // アニメーション
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 100);
    
    // 自動削除
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, duration);
}

// ローディング状態の管理
function setupLoadingStates() {
    const submitButtons = document.querySelectorAll('button[type="submit"]');
    submitButtons.forEach(button => {
        const form = button.closest('form');
        if (form) {
            form.addEventListener('submit', function() {
                button.disabled = true;
                button.textContent = '処理中...';
                
                // 3秒後にボタンを復活させる（エラー時のため）
                setTimeout(() => {
                    button.disabled = false;
                    button.textContent = button.getAttribute('data-original-text') || '送信';
                }, 3000);
            });
            
            // 元のテキストを保存
            button.setAttribute('data-original-text', button.textContent);
        }
    });
}

// 確認ダイアログ
function confirmAction(message, callback) {
    if (confirm(message)) {
        callback();
    }
}

// 管理画面: セミナー削除の確認
function confirmDeleteSeminar(seminarId, seminarTitle) {
    const message = `「${seminarTitle}」を削除してもよろしいですか？\n※この操作は取り消せません。`;
    
    if (confirm(message)) {
        // 削除処理を実行
        fetch(`/admin/seminar/${seminarId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => {
            if (response.ok) {
                showToast('セミナーが削除されました');
                location.reload();
            } else {
                showToast('削除に失敗しました', 'error');
            }
        })
        .catch(error => {
            console.error('削除エラー:', error);
            showToast('削除に失敗しました', 'error');
        });
    }
}

// モバイル対応: タッチイベント
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch-device');
    
    // タッチデバイス用のスタイル調整
    const style = document.createElement('style');
    style.textContent = `
        .touch-device .seminar-card:hover,
        .touch-device .admin-seminar-card:hover {
            transform: none;
        }
        
        .touch-device .action-btn:hover,
        .touch-device .book-btn:hover {
            transform: scale(0.95);
        }
    `;
    document.head.appendChild(style);
}

// PWA対応（将来的な拡張用）
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // サービスワーカーの登録は今回は省略
        console.log('Service Worker ready for future implementation');
    });
}

// デバッグ用のユーティリティ関数
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.seminarDebug = {
        showToast: showToast,
        validateForm: validateForm,
        copyToClipboard: copyToClipboard
    };
}