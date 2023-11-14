const Decimal = require('decimal.js');

function weiToEther(weiValue) {
    const wei = new Decimal(weiValue);
    const ether = wei.dividedBy(new Decimal(1e18));
    return ether.toNumber();
}

function etherToWei(etherValue) {
    const ether = new Decimal(etherValue);
    const wei = ether.times(new Decimal(1e18));
    return wei.toNumber();
}

module.exports = {
    weiToEther,
    etherToWei,
};
