class Transaction {
    constructor(amount, payer, payee, fees = 0) {
        this.amount = parseFloat(amount);
        this.payer = payer;
        this.payee = payee;
        this.fees = parseFloat(fees); // Convertir en nombre et s'assurer qu'il est non-nul
        this.timestamp = Date.now(); // Ajout d'un timestamp pour l'ordre
    }

    toString() {
        return JSON.stringify(this);
    }
}

class Block {
    constructor(prevHash, transactions, ts = Date.now()) {
        this.prevHash = prevHash;
        this.transactions = Array.isArray(transactions) ? transactions : [transactions];
        this.ts = ts;
        this.nonce = 0; // Start with 0 for mining
        // Calculate hash when block is created
        this._hash = "";
        this.calculateHash().then(hash => {
            this._hash = hash;
        });
    }

    // Generate a deterministic hash based on block data using SHA-256
    async calculateHash() {
        const data = this.prevHash + 
                     JSON.stringify(this.transactions) + 
                     this.ts.toString() + 
                     this.nonce.toString();
        
        // Use SHA-256 instead of the simple hash function
        return await sha256(data);
    }

    // Getter for hash to ensure it's read-only
    get hash() {
        return this._hash;
    }

    // Mine the block with a given difficulty
    async mine(difficulty) {
        // Create a target string with 'difficulty' number of leading zeros
        const target = '0'.repeat(difficulty);
        
        // Keep incrementing nonce until we find a hash with the required number of leading zeros
        while (this._hash.substring(0, difficulty) !== target) {
            this.nonce++;
            this._hash = await this.calculateHash();
        }
        
        console.log(`Block mined! Nonce: ${this.nonce}, Hash: ${this._hash}`);
        return this._hash;
    }
}

class Chain {
    static instance = new Chain();
    constructor() {
        // Initialize the chain asynchronously
        this.initChain();
    }

    async initChain() {
        // Create genesis block
        const genesisBlock = new Block('0'.repeat(64), new Transaction(100, 'genesis', 'satoshi'));
        // Manually set the hash for genesis block
        await genesisBlock.calculateHash().then(hash => {
            genesisBlock._hash = hash;
        });
        
        this.chain = [genesisBlock];
        this.pendingTransactions = [];
        this.difficulty = 2; // Default difficulty - number of leading zeros required
        this.initialReward = 50; // Initial mining reward in BTC
        this.halvingInterval = 10; // Number of blocks before reward halving
        this.maxTransactionsPerBlock = 5; // Maximum number of transactions per block
        
        // Update UI after initialization
        updateBlockchain();
        updateBlockchainStats();
    }

    get lastBlock() {
        return this.chain[this.chain.length - 1];
    }

    // Calculate current mining reward based on blockchain height
    get miningReward() {
        const blockHeight = this.chain.length;
        const halvingCount = Math.floor(blockHeight / this.halvingInterval);
        return this.initialReward / Math.pow(2, halvingCount);
    }

    // Calculate blocks until next halving
    get blocksUntilHalving() {
        const blockHeight = this.chain.length;
        const nextHalving = Math.ceil(blockHeight / this.halvingInterval) * this.halvingInterval;
        return nextHalving - blockHeight;
    }

    addTransaction(transaction) {
        this.pendingTransactions.push(transaction);
        updateTransactions();
        updateMempool();
    }

    // Méthode pour sélectionner les transactions prioritaires selon les frais
    selectPriorityTransactions() {
        // Trier les transactions par frais (fee) décroissants
        const sortedTransactions = [...this.pendingTransactions]
            .sort((a, b) => b.fees - a.fees);
        
        // Limiter au nombre maximum de transactions par bloc
        return sortedTransactions.slice(0, this.maxTransactionsPerBlock);
    }

    // Update the difficulty level
    setDifficulty(newDifficulty) {
        this.difficulty = parseInt(newDifficulty);
        updateMiningDifficulty();
    }

    async minePendingTransactions(minerAddress) {
        if (this.pendingTransactions.length === 0) {
            alert('No transactions in mempool to mine!');
            return;
        }
        
        // Vérifier qu'on n'est pas déjà en train de miner
        const indicator = document.getElementById('mining-indicator');
        if (indicator && indicator.style.display === 'inline-block') {
            console.log('Already mining, please wait...');
            return;
        }
        
        // Obtenir la récompense actuelle
        const currentReward = this.miningReward;
        
        // Sélectionner les transactions prioritaires avec les frais les plus élevés
        let transactionsToMine = this.selectPriorityTransactions();
        
        // Calculer le total des frais pour ce bloc (s'assurer que ce sont des nombres)
        const totalFees = transactionsToMine.reduce((sum, tx) => {
            const fee = parseFloat(tx.fees || 0);
            return sum + fee;
        }, 0);
        
        console.log(`Mining block with ${transactionsToMine.length} transactions and ${totalFees} BTC in fees`);
        
        // Ajouter directement la récompense et les frais au mineur si une adresse est fournie
        if (minerAddress) {
            // Trouver le portefeuille correspondant
            const minerWallet = wallets.find(w => w.publicKey === minerAddress);
            if (minerWallet) {
                // Ajouter directement la récompense et les frais au portefeuille du mineur
                minerWallet.balance += currentReward + totalFees;
                console.log(`Miner wallet ${minerWallet.name}: Added ${currentReward} reward + ${totalFees} fees. New balance: ${minerWallet.balance}`);
                
                // Créer une transaction de récompense pour l'historique uniquement
                const rewardTx = new Transaction(
                    currentReward,
                    'network',
                    minerAddress,
                    0 // Pas de frais sur la récompense
                );
                
                // Créer une transaction de frais séparée pour plus de clarté
                let feesTx = null;
                if (totalFees > 0) {
                    feesTx = new Transaction(
                        totalFees,
                        'fees',
                        minerAddress,
                        0
                    );
                    console.log(`Created fees transaction of ${totalFees} BTC`);
                }
                
                // Ajouter la transaction de récompense et éventuellement celle des frais
                transactionsToMine.push(rewardTx);
                if (feesTx) transactionsToMine.push(feesTx);
                
                // Vérifier si on vient d'avoir un événement de halvage
                if (this.blocksUntilHalving === this.halvingInterval - 1) {
                    // Cela signifie qu'on est sur un bloc juste après le halvage
                    setTimeout(() => {
                        alert(`🎉 Block reward halving event! 🎉\nReward reduced from ${currentReward * 2} BTC to ${currentReward} BTC`);
                    }, 500);
                }
            }
        }
        
        // Créer un nouveau bloc avec le hash du bloc précédent et les transactions prioritaires
        const block = new Block(this.lastBlock.hash, transactionsToMine);
        
        // Démarrer le minage avec la difficulté actuelle
        updateMiningStatus(true, this.difficulty);
        
        try {
            // Simuler un délai pour l'effet visuel
            await new Promise(resolve => setTimeout(resolve, 500 + this.difficulty * 300));
            
            // Miner le bloc (trouver un hash valide)
            await block.mine(this.difficulty);
            
            // Ajouter le bloc à la chaîne
            this.chain.push(block);
            
            // Supprimer les transactions minées du mempool
            const minedTxIds = transactionsToMine
                .filter(tx => tx.payer !== 'network' && tx.payer !== 'fees') // Exclure les transactions de récompense et de frais
                .map(tx => JSON.stringify({amount: tx.amount, payer: tx.payer, payee: tx.payee}));
            
            this.pendingTransactions = this.pendingTransactions.filter(tx => 
                !minedTxIds.includes(JSON.stringify({amount: tx.amount, payer: tx.payer, payee: tx.payee}))
            );
            
            // Mettre à jour l'interface utilisateur
            updateBlockchain();
            updateMempool();
            updateWallets(); // Important: mettre à jour les portefeuilles pour afficher le nouveau solde
            updateMiningStatus(false);
            updateRewardInfo();
            
            return block;
        } catch (error) {
            console.error('Mining failed:', error);
            updateMiningStatus(false);
            return null;
        }
    }
}

const wallets = [];
function initializeBlockchain() {
    const satoshi = new Wallet('Satoshi');
    satoshi.balance = 100;
    const bob = new Wallet('Bob');
    const alice = new Wallet('Alice');
    wallets.push(satoshi, bob, alice);
    updateWallets();
    updateBlockchain();
    createMempoolUI();
    updateMempool();
    updateBlockchainStats();
    updateMiningDifficulty();
    updateRewardInfo();
}

function createMempoolUI() {
    // Find or create the mempool container
    let mempoolContainer = document.getElementById('mempool-container');
    if (!mempoolContainer) {
        const mainElement = document.getElementById('main');
        if (!mainElement) return;
        
        // Create the mempool section
        const mempoolSection = document.createElement('section');
        mempoolSection.className = 'post';
        mempoolSection.innerHTML = `
            <header class="major">
                <h2>Mempool</h2>
                <p>Pending transactions waiting to be mined</p>
            </header>
            <div id="mempool-container" class="mempool-container">
                <div id="mempool-stats" class="mempool-stats">
                    <div class="mempool-stat">
                        <strong>Transactions:</strong> 0
                    </div>
                    <div class="mempool-stat">
                        <strong>Total Value:</strong> 0.00 BTC
                    </div>
                </div>
                <div id="mempool-txs" class="mempool-txs"></div>
                <div class="mempool-actions">
                    <button id="mine-all-btn" class="button primary">Mine All Transactions</button>
                </div>
            </div>
        `;
        
        // Insert after the first section or at the beginning
        const firstSection = mainElement.querySelector('section');
        if (firstSection) {
            firstSection.after(mempoolSection);
        } else {
            mainElement.prepend(mempoolSection);
        }
    }
    
    // Add event listener for the mine all button
    document.getElementById('mine-all-btn')?.addEventListener('click', async function() {
        // Get the active wallet for mining reward
        const activeWalletIndex = document.getElementById('mining-wallet')?.value || 0;
        const minerAddress = wallets[activeWalletIndex]?.publicKey;
        
        const block = await Chain.instance.minePendingTransactions(minerAddress);
        if (block) {
            alert(`Block mined successfully with ${block.transactions.length} transactions!\nHash found with nonce: ${block.nonce}`);
        }
    });
}

function updateMiningStatus(isMining, difficulty) {
    const indicator = document.getElementById('mining-indicator');
    const statusText = document.getElementById('mining-status-text');
    
    if (!indicator || !statusText) return;
    
    if (isMining) {
        indicator.style.display = 'inline-block';
        statusText.textContent = `Mining in progress `;
    } else {
        indicator.style.display = 'none';
        statusText.textContent = 'Mining complete!';
        
        setTimeout(() => {
            statusText.textContent = 'Ready to mine';
        }, 2000);
    }
}

function updateRewardInfo() {
    const rewardElement = document.getElementById('mining-reward');
    if (rewardElement) {
        const currentReward = Chain.instance.miningReward;
        const blocksUntilHalving = Chain.instance.blocksUntilHalving;
        rewardElement.innerHTML = `
            <div>Mining Reward: <strong>${currentReward} BTC</strong></div>
            <div class="halving-info">Next halving in <strong>${blocksUntilHalving}</strong> blocks</div>
        `;
    }
}

function updateMiningDifficulty() {
    const difficultyElement = document.getElementById('mining-difficulty');
    if (difficultyElement) {
        difficultyElement.value = Chain.instance.difficulty;
    }
    
    const difficultyDisplay = document.getElementById('current-difficulty');
    if (difficultyDisplay) {
        difficultyDisplay.textContent = Chain.instance.difficulty;
    }
}

// Mise à jour de la fonction updateMempool pour afficher les frais
function updateMempool() {
    const stats = document.getElementById('mempool-stats');
    const txContainer = document.getElementById('mempool-txs');
    
    if (!stats || !txContainer) return;
    
    const txCount = Chain.instance.pendingTransactions.length;
    let totalValue = 0;
    let totalFees = 0;
    
    Chain.instance.pendingTransactions.forEach(tx => {
        totalValue += parseFloat(tx.amount);
        totalFees += parseFloat(tx.fees || 0);
    });
    
    // Update stats
    stats.innerHTML = `
        <div class="mempool-stat">
            <strong>Transactions:</strong> ${txCount}
        </div>
        <div class="mempool-stat">
            <strong>Total Value:</strong> ${totalValue.toFixed(2)} BTC
        </div>
        <div class="mempool-stat">
            <strong>Total Fees:</strong> ${totalFees.toFixed(2)} BTC
        </div>
    `;
    
    // Update transaction list
    txContainer.innerHTML = '';
    
    // Trier les transactions par frais décroissants pour montrer la priorité
    [...Chain.instance.pendingTransactions]
        .sort((a, b) => (b.fees || 0) - (a.fees || 0))
        .forEach((tx, index) => {
            const isPriority = index < Chain.instance.maxTransactionsPerBlock;
            
            const txElement = document.createElement('div');
            txElement.className = `transaction ${isPriority ? 'priority' : ''}`;
            txElement.innerHTML = `
                <div class="transaction-details">
                    <span>Amount: ${tx.amount} BTC</span>
                    <span>From: ${tx.payer === 'network' ? 'Mining Reward' : tx.payer}</span>
                    <span>To: ${tx.payee}</span>
                    <span>Fees: ${tx.fees || 0} BTC</span>
                    ${isPriority ? '<span class="priority-badge">Priority</span>' : ''}
                </div>
            `;
            txContainer.appendChild(txElement);
        });
    
    updateBlockchainStats();
}

function updateBlockchainStats() {
    const blockCountEl = document.getElementById('block-count');
    const txCountEl = document.getElementById('tx-count');
    
    if (blockCountEl) {
        blockCountEl.textContent = Chain.instance.chain.length;
    }
    
    if (txCountEl) {
        let txCount = 0;
        Chain.instance.chain.forEach(block => {
            if (Array.isArray(block.transactions)) {
                txCount += block.transactions.length;
            } else if (block.transaction) {
                txCount += 1;
            }
        });
        txCountEl.textContent = txCount;
    }
}

function updateWallets() {
    const container = document.getElementById('wallets-container');
    if (!container) return;
    
    container.innerHTML = '';
    wallets.forEach((wallet, index) => {
        const walletElement = document.createElement('div');
        walletElement.className = 'wallet';
        walletElement.innerHTML = `
            <div class="wallet-name">
                <span>${wallet.name}</span>
                <span>#${index + 1}</span>
            </div>
            <div class="wallet-balance">${wallet.balance} BTC</div>
            <div class="public-key">Public Key: ${wallet.publicKey}</div>
        `;
        container.appendChild(walletElement);
    });
}

// Mise à jour de la fonction updateBlockchain pour afficher les frais
function updateBlockchain() {
    const container = document.getElementById('blockchain-container');
    if (!container) return;
    
    // Effacer COMPLÈTEMENT le conteneur avant d'ajouter les blocs
    container.innerHTML = '';
    
    // Afficher les blocs dans l'ordre chronologique (du plus ancien au plus récent)
    Chain.instance.chain.forEach((block, index) => {
        const blockElement = document.createElement('div');
        blockElement.className = 'block';
        blockElement.id = `block-${index}`; // Ajouter un ID unique
        const date = new Date(block.ts);
        const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        
        // Calculer le total des frais pour ce bloc
        const totalFees = block.transactions
            .filter(tx => tx.payer !== 'network' && tx.payer !== 'genesis' && tx.payer !== 'fees')
            .reduce((sum, tx) => sum + (parseFloat(tx.fees) || 0), 0);
        
        // Générer la liste des transactions HTML
        let transactionsHtml = '';
        const transactions = Array.isArray(block.transactions) ? block.transactions : [block.transaction];
        
        transactions.forEach(tx => {
            // Déterminer le type de transaction pour l'affichage
            let txType = 'Transaction';
            if (tx.payer === 'network') txType = 'Mining Reward';
            if (tx.payer === 'fees') txType = 'Transaction Fees';
            if (tx.payer === 'genesis') txType = 'Genesis';
            
            transactionsHtml += `
                <div class="transaction-info">
                    <div class="transaction-header">
                        <span>${txType}</span>
                        <span class="amount">${tx.amount} BTC</span>
                    </div>
                    <dl class="transaction-details">
                        <dt>From:</dt>
                        <dd>${tx.payer === 'genesis' ? 'Genesis Block' : (tx.payer === 'network' ? 'Network' : (tx.payer === 'fees' ? 'Transaction Fees' : tx.payer))}</dd>
                        <dt>To:</dt>
                        <dd>${tx.payee}</dd>
                        ${tx.payer !== 'network' && tx.payer !== 'genesis' && tx.payer !== 'fees' ? `
                        <dt>Fees:</dt>
                        <dd>${tx.fees || 0} BTC</dd>
                        ` : ''}
                    </dl>
                </div>
            `;
        });
        
        blockElement.innerHTML = `
            <div class="block-header">
                <div class="block-number">Block #${index}</div>
                <div class="block-timestamp">${formattedDate}</div>
            </div>
            <div class="hash-info">
                <span class="hash-label">Hash:</span>
                <span>${block.hash}</span>
            </div>
            <div class="hash-info">
                <span class="hash-label">Previous Hash:</span>
                <span>${block.prevHash || '(Genesis Block)'}</span>
            </div>
            <div class="hash-info">
                <span class="hash-label">Nonce:</span>
                <span>${block.nonce}</span>
            </div>
            ${totalFees > 0 ? `
            <div class="hash-info">
                <span class="hash-label">Total Fees:</span>
                <span>${totalFees.toFixed(2)} BTC</span>
            </div>
            ` : ''}
            <div class="block-transactions">
                <h4>Transactions (${transactions.length})</h4>
                ${transactionsHtml}
            </div>
        `;
        
        // Ajouter le bloc dans l'ordre (les plus anciens en haut, ou inversez si vous préférez)
        container.appendChild(blockElement);
    });
    
    updateBlockchainStats();
}

function updateTransactions() {
    const container = document.getElementById('transactions-container');
    if (!container) return;
    
    container.innerHTML = '';
    Chain.instance.pendingTransactions.forEach((tx, index) => {
        const txElement = document.createElement('div');
        txElement.className = 'transaction';
        txElement.innerHTML = `
            <div class="transaction-details">
                <span>Amount: ${tx.amount} BTC</span>
                <span>From: ${tx.payer}</span>
                <span>To: ${tx.payee}</span>
            </div>
        `;
        container.appendChild(txElement);
    });
}

// Supprimer les écouteurs existants pour éviter les doublons
const oldMineBtn = document.getElementById('mine-btn');
if (oldMineBtn) {
    const newMineBtn = oldMineBtn.cloneNode(true);
    oldMineBtn.parentNode.replaceChild(newMineBtn, oldMineBtn);
    
    newMineBtn.addEventListener('click', async function() {
        const activeWalletIndex = document.getElementById('mining-wallet')?.value || 0;
        const minerAddress = wallets[activeWalletIndex]?.publicKey;
        
        await Chain.instance.minePendingTransactions(minerAddress);
    });
}

const oldMineAllBtn = document.getElementById('mine-all-btn');
if (oldMineAllBtn) {
    const newMineAllBtn = oldMineAllBtn.cloneNode(true);
    oldMineAllBtn.parentNode.replaceChild(newMineAllBtn, oldMineAllBtn);
    
    newMineAllBtn.addEventListener('click', async function() {
        const activeWalletIndex = document.getElementById('mining-wallet')?.value || 0;
        const minerAddress = wallets[activeWalletIndex]?.publicKey;
        
        const block = await Chain.instance.minePendingTransactions(minerAddress);
        if (block) {
            alert(`Block mined successfully with ${block.transactions.length} transactions!\nHash found with nonce: ${block.nonce}`);
        }
    });
}

document.getElementById('mine-btn')?.addEventListener('click', async function() {
    updateMiningStatus(true);
    await Chain.instance.minePendingTransactions();
});

document.getElementById('create-wallet')?.addEventListener('click', function() {
    const name = prompt('Enter wallet name:');
    if (name) {
        const newWallet = new Wallet(name);
        wallets.push(newWallet);
        updateWallets();
    }
});

// Mise à jour de la classe Wallet pour inclure les frais
class Wallet {
    constructor(name = 'Wallet') {
        this.name = name;
        this.balance = 0;
        this.privateKey = Array.from({length: 30}, () => Math.floor(Math.random() * 16).toString(16)).join('');
        this.publicKey = Array.from({length: 20}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }

    addTransaction(amount, payeePublicKey, fees = 0) {
        // Convertir les valeurs en nombres pour éviter les problèmes de type
        amount = parseFloat(amount);
        fees = parseFloat(fees);
        
        if (this.balance < amount + fees) {
            alert(`Insufficient funds! (Amount ${amount} + Fees ${fees} exceed balance ${this.balance})`);
            return false;
        }

        // Déduire le montant ET les frais du portefeuille de l'expéditeur
        this.balance -= (amount + fees);
        console.log(`Wallet ${this.name}: Deducted ${amount} + ${fees} fees. New balance: ${this.balance}`);

        // Créer la transaction avec les frais spécifiés
        const transaction = new Transaction(amount, this.publicKey, payeePublicKey, fees);
        
        // Ajouter le montant (sans les frais) au portefeuille du destinataire
        const recipient = wallets.find(w => w.publicKey === payeePublicKey);
        if (recipient) {
            recipient.balance += amount;
            console.log(`Wallet ${recipient.name}: Added ${amount}. New balance: ${recipient.balance}`);
            
            // Ajouter la transaction au mempool
            Chain.instance.addTransaction(transaction);
            updateWallets();
            return true;
        }
        return false;
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', initializeBlockchain);

// Assurez-vous également que l'écouteur d'événement pour l'envoi de transaction gère correctement les frais
document.addEventListener('DOMContentLoaded', function() {
    const sendButton = document.getElementById('send-transaction');
    sendButton?.addEventListener('click', function() {
        const fromWalletSelect = document.getElementById('from-wallet');
        const toWalletSelect = document.getElementById('to-wallet');
        const amountInput = document.getElementById('amount');
        const feesInput = document.getElementById('tx-fees');
        
        const fromIndex = fromWalletSelect.value;
        const toIndex = toWalletSelect.value;
        const amount = parseFloat(amountInput.value);
        const fees = parseFloat(feesInput.value || 0);
        
        console.log(`Sending transaction: ${amount} BTC with ${fees} BTC in fees`);
        
        if (fromIndex === toIndex) {
            alert('Cannot send to the same wallet!');
            return;
        }
        
        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid amount!');
            return;
        }
        
        if (isNaN(fees) || fees < 0) {
            alert('Please enter valid fees (0 or positive value)!');
            return;
        }
        
        const sender = wallets[fromIndex];
        const recipient = wallets[toIndex];
        
        const success = sender.addTransaction(amount, recipient.publicKey, fees);
        if (success) {
            amountInput.value = "1";
            feesInput.value = "0.01";
        }
    });
});