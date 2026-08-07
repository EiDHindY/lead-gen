let debounceTimer;

const injectMainButton = () => {
    // Look for the Share button
    let shareBtn = document.querySelector('button[data-value="Share"]');
    
    if (!shareBtn) {
        const buttons = document.querySelectorAll('button');
        for (const b of buttons) {
            if (b.textContent && b.textContent.trim() === 'Share' && b.querySelector('img, svg')) {
                shareBtn = b;
                break;
            }
        }
    }
    
    if (shareBtn) {
        if (!document.getElementById('main-copy-format-btn')) {
            const copyFormatBtn = shareBtn.cloneNode(true);
            copyFormatBtn.id = 'main-copy-format-btn';
            
            if (copyFormatBtn.hasAttribute('data-value')) {
                copyFormatBtn.setAttribute('data-value', 'Copy Format');
            }
            
            const replaceText = (node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    if (node.textContent.trim() === 'Share') {
                        node.textContent = 'Copy Format';
                    }
                } else {
                    node.childNodes.forEach(replaceText);
                }
            };
            replaceText(copyFormatBtn);
            
            shareBtn.parentNode.insertBefore(copyFormatBtn, shareBtn.nextSibling);
            
            copyFormatBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleInstantCopy(copyFormatBtn);
            });
        }
    }
};

const observer = new MutationObserver((mutations) => {
    let hasNewNodes = false;
    for (let m of mutations) {
        if (m.addedNodes.length > 0) {
            hasNewNodes = true;
            break;
        }
    }
    
    if (hasNewNodes) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(injectMainButton, 300);
    }
});

observer.observe(document.body, { childList: true, subtree: true });
injectMainButton();

function handleInstantCopy(copyFormatBtn) {
    try {
        // 1. Get Venue Name (Primary: h1 tag, Fallback: document.title)
        let venueName = '';
        const h1 = document.querySelector('h1');
        if (h1 && h1.textContent) {
            venueName = h1.textContent.trim();
        } else {
            venueName = document.title.replace(' - Google Maps', '').trim();
        }
        
        // 2. Get Address
        let address = '';
        const addressBtn = document.querySelector('button[data-item-id="address"]');
        if (addressBtn) {
            const aria = addressBtn.getAttribute('aria-label');
            if (aria) {
                // Usually "Address: 36 Burnett Ln..."
                address = aria.replace('Address:', '').trim();
            } else {
                address = addressBtn.textContent.trim();
            }
        }
        
        // 3. Get the long URL
        const url = window.location.href;
        
        // 4. Format the text
        const formattedText = `${venueName}\n${address}\n${url}`.trim();
        
        // 5. Copy to clipboard synchronously
        navigator.clipboard.writeText(formattedText).then(() => {
            const originalTextNode = findTextNode(copyFormatBtn, 'Copy Format');
            if (originalTextNode) {
                originalTextNode.textContent = 'Copied!';
                setTimeout(() => {
                    if (originalTextNode) originalTextNode.textContent = 'Copy Format';
                }, 2000);
            }
        }).catch(err => {
            console.error('Failed to copy to clipboard API: ', err);
            fallbackCopyTextToClipboard(formattedText);
        });
        
    } catch (e) {
        console.error('Error during extraction: ', e);
        alert('Failed to extract venue details.');
    }
}

// Fallback clipboard method for older browsers or strict security contexts
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (!successful) {
            console.error('Fallback: Copying text command was unsuccessful');
        }
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }

    document.body.removeChild(textArea);
}

function findTextNode(node, text) {
    if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.trim() === text) {
            return node;
        }
    } else {
        for (let child of node.childNodes) {
            const found = findTextNode(child, text);
            if (found) return found;
        }
    }
    return null;
}
