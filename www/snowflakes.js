import Snowflakes from 'https://cdn.skypack.dev/magic-snowflakes';

// always run
 new Snowflakes();

// OR use date
// month in JS dates are zero-based
const currentMonth = new Date().getMonth() + 1;
const currentDay = new Date().getDate();

// run from december 6th to january 15th 
const isOkForDecember = currentMonth === 12 && currentDay >= 6;
const isOkForJanuary = currentMonth === 1 && currentDay <= 15;
if (isOkForDecember || isOkForJanuary ) {
 // new Snowflakes();  
}

