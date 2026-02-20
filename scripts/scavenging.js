//------------------------------
//Tribal Wars script: Scavenging distributor - "Outstanding Organizer"
//Made by Erlend/Linoko
//Last updated: 08. November 2021
//------------------------------


//------------------------------
//Run program at correct screen
//------------------------------

if(window.location.href.indexOf("scavenge") == -1){
    window.open("/game.php?/&screen=place&mode=scavenge","_self"); // Go to scavenger-screen
}
else if($("#organizer_table")[0] != undefined){ // If script is already running, reset script but do not setup user interface.
    resetGlobals();
    throw new Error("Script running!");
} 

//-----------------------------
//Declare some global variables
//-----------------------------

var scriptHTML = $("script:contains('loot_factor')")[0].innerHTML, // Locate script containing loot constants for the world
    levelNames = ["LL", "HH", "CC", "GG"], // Define short-names for the scavenger levels
    lootConstants = {}, // Constants for calculating resources and duration time, individual for each world, calculated in loop later
    version = game_data.version.split(" ")[0],
    imgSrc = {
        "organizer" : "https://dsen.innogamescdn.com/asset/" + version + "/graphic/knight/skills/8.png",
        "loading" : "https://dsen.innogamescdn.com/asset/" + version + "/graphic/loading.gif"
    },
    availableUnits = [], // Available units in world, defined in setupUi()
    unitCc = { "spear" : 25, "sword" : 15, "axe" : 10, "archer" : 10, "light" : 80, "marcher" : 50, "heavy" : 50}, // Carry capacities per unit
    calculating = false, // To check whether calculations are running
    calcCheckInterval, // Interval to check whether calculation-interval is finished
    distributionArray = [];

for(var i = 0; i < levelNames.length; i++){ //Get loot constants from TW for each level
    lootConstants[levelNames[i]] = {
            "loot_factor" : Number(scriptHTML.split('"loot_factor":')[2*i+1].split(",")[0]), // So far constant: 0.1, 0.25, 0.5 and 0.75 for every world
            "duration_exponent" : Number(scriptHTML.split('"duration_exponent":')[i+1].split(",")[0]), // So far constant: 0.45 for every world
            "duration_initial_seconds" : Number(scriptHTML.split('"duration_initial_seconds":')[i+1].split(",")[0]), // So far constant: 1800 for every world
            "duration_factor" : Number(scriptHTML.split('"duration_factor":')[i+1].split(",")[0]), // Varies with world speed
            "SS" : {
                "loot_factor" : Number(scriptHTML.split('"loot_factor":')[2*i+2].split(",")[0]) // Used to calculate loot with premium activated
            }
    };
}

//----------------------------------
//Global return variables
//Excessive use of global variables to allow timed calculations without return statements
//Avoids crashes and allows cancelation of too long calculations
//----------------------------------

var ccDistribution = 0, // Carry capacity distribution
    cc = 0, // Carry capacity that has been distributed
    carryCapPerUnit = 25, // Step size for optimization calculation
    carryCapPerLvl = 0, // Carry cap distributed per level
    loopLim = 1000, // Limit for how many iterations can be run at a time for the while loop in getDistributions()
    maxLevel = 4 - $(".lock").length, // Maximum available level for calculation
    globalCarryCap = 0, // Carry capacity for inputted troops accessable for every function
    availableLevels = [];

//----------------------------------
//Define functions to use in program
//----------------------------------

function resetGlobals(){ // Reset global variables.
    ccDistribution = 0;
    cc = 0;
    carryCapPerUnit = 5;
    carryCapPerLvl = 0;
    maxLevel = 4 - $(".lock").length;
    calculating = false;
    globalCarryCap = 0;
    availableLevels = [];
    clearInterval(calcCheckInterval);
    $("#loading_bar")[0].innerText = ""; // Set loading bar to zero % (loading bar used to show calculation progress)
}

function calcDurationSeconds(cc, lvl) { //Calculate duration for a given carry capacity and level
    var lf = lootConstants[levelNames[lvl]]["loot_factor"],
        de = lootConstants[levelNames[lvl]]["duration_exponent"],
        dis = lootConstants[levelNames[lvl]]["duration_initial_seconds"],
        df = lootConstants[levelNames[lvl]]["duration_factor"];
    return Math.round((Math.pow(100*cc*cc*lf*lf, de) + dis) * df); // Formula to calculate duration for a given carry capacity (cc) and level. From TW-scav script
}
function calcDvResPerHour(cc, lvl, isPremiumActive){ //Calculate derivative of resources per hour with respect to carry capacity
    if(cc == 0) cc = 1;
    var lf = lootConstants[levelNames[lvl]]["loot_factor"],
        de = lootConstants[levelNames[lvl]]["duration_exponent"] * 2, //Doubled from simplification of expression
        dis = lootConstants[levelNames[lvl]]["duration_initial_seconds"],
        df = lootConstants[levelNames[lvl]]["duration_factor"],
        pf = lootConstants[levelNames[lvl]]["SS"]["loot_factor"],
        timeFactor = Math.pow(10 * lf * cc, de) + dis,
        resFactor = lf * 3600;
    isPremiumActive && (resFactor *= pf);
    //Derivative of calcLoot() function over calcDurationSeconds()
    return ( ( resFactor ) / ( df * timeFactor) ) * ( 1 - ( lf * de * cc * Math.pow(10, de) * Math.pow(lf * cc, de - 1) ) / ( timeFactor ) )
}

function calcLoot(cc, lvl, isPremiumActive) { //Calculate loot for a given carry capacity and level and whether or not premium boost is activated
    var loot = Math.round(cc * lootConstants[levelNames[lvl]]["loot_factor"]);
    return isPremiumActive && (loot *= lootConstants[levelNames[lvl]]["SS"]["loot_factor"]), Math.round(loot)
}

function calcResPerHour(carryCap, level, isPremiumActive){ //Calculate resources per hour for a given carry capacity and level
    return (calcLoot(carryCap, level, isPremiumActive) * 3600) / calcDurationSeconds(carryCap, level);
}

function getRphTotal(carryCapList){ //Calculate total rph for all levls activated
    var sum = 0;
    for(var i = 0; i < carryCapList.length; i++) sum += calcResPerHour(carryCapList[i], i, $("input[name='premium_select']")[availableLevels[i]].checked);
    return Math.round(sum);
}

function getAvailableLevels()
{
    var levels = [ false, false, false, false ];
    for(var i = 0; i < levels.length; i++){
        var isActive = $(".scavenge-option")[i].contains( $("a[class*='free_send_button']",$(".scavenge-option")[i])[0]);
        if( isActive ) levels[i] = true;
    }
    return levels;
}

function setupUi(){ //Set up user interface
    var frame = document.createElement("DIV"), // Wapper for user interface
        frameClass = document.createAttribute("class"),
        contentId = document.createAttribute("id");
    frameClass.value = "scavenge-option border-frame-gold-red";
    contentId.value = "outstanding_organizer";
    frame.setAttributeNode(frameClass);
    frame.setAttributeNode(contentId);
    //Define contents (html and css) for the user interface:
    var tableHeaders = "<th>Level</th><th><span title='+20%' class='coinbag coinbag-header'></span></th>",
        troopInputs = "",
        totalRow = "<td><b>Total:</b></td><td></td>",
        distributionRows = ["","","",""],
        distributionRowsCombined = "",
        lvlSelect = "<select name='levels' onchange='levelChange()' value = '5'>",
        savedUnits = getStoredUnits();

    var availableLevels = getAvailableLevels();

    for(var i = 1; i < 5; i++) lvlSelect += "<option value = '"+ i +"'>" + i + "</option>";
    lvlSelect += "<option value='5' selected>*</option></select></td><td><input style='display:block;width:16px' title='Select all' onclick='premiumSelectAll()' type='checkbox'></td>";
    troopInputs += "<td>" + lvlSelect + "</td>";
	var nrOfUnits = $(".unitsInput").length;
	if($(".unitsInput")[nrOfUnits-1].name == "knight") nrOfUnits--;
    for(var i = 0; i < nrOfUnits; i++){
        tableHeaders += "<th>"+ $(".unit_link").parent()[i].innerHTML +"</th>";
        availableUnits.push($(".unitsInput").parent()[i].innerHTML.split("name=\"")[1].split("\"")[0]);
        troopInputs += "<td>"+ $(".unitsInput").parent()[i].innerHTML.replace('value="', 'value="'+savedUnits[i]).split("<a")[0];
        troopInputs +=  ($(".unitsInput").parent()[i].innerHTML.split(">")[1] + ">"
                    + $(".unitsInput").parent()[i].innerHTML.split(">")[2] + ">").replace("href=\"#\"", "onclick=\"fillUnit('"+availableUnits[i]+"')\"") + "</td>";
        totalRow += "<td>0</td>";
        for(var j = 0; j < distributionRows.length; j++) distributionRows[j] += "<td>0</td>";
    }
    for(var i = 0; i < distributionRows.length; i++){
        distributionRowsCombined += "<tr class='command-row " + (availableLevels[i] ? "" : "grey") + "'><td style='white-space:nowrap'><button class='"
            + (availableLevels[i] ? "btn" : "btn btn-disabled") + "' title='Fill' onclick = 'fillScavInputs(" + i + ")'><b>Lvl "+ (i + 1) +"</b></button></td><td><input name='premium_select' style='display:block;width:16px' type='checkbox'></td>"
            +distributionRows[i]+"<td style='white-space: nowrap'>0 <span class='icon header res'></span></td><td>0</td></tr>";
    
    }
    
    //Implement contents to frame:
    tableHeaders += "<th style='width:100%'>All</th><th title='Resources per hour'>RPH</th>";
    troopInputs += "<td><span style='cursor:pointer' title='Save current input' onclick='saveUnits()' class='icon header inventory'></span><br><a style = 'white-space:nowrap;display:block;width:100px' class='fill-all' onclick='inputAllTroops()'>All troops</a></td>\
    <td><button class='btn' name='distribute' onclick='distributeClick()' style='width:78px;height:24px;align-items:center'><span id='loading_bar' style='position:absolute;margin-left:-25px;margin-top:1px;height:14px;font-family:verdana;background-color:gray;color:gray'></span>\
    <img rel='prefetch' style='display:none' src='" + imgSrc["loading"] + "'>Distribute</div></button></td>";
    frame.innerHTML = "<table><td><div style='text-align:center; float:left; width:175px'><img src='"+imgSrc['organizer']+"'><div class='title'>Outstanding Organizer</div></div>\
        </td><td><div class='candidate-squad-container' style='float:left'><table class='candidate-squad-widget vis' id='organizer_table' style='width:100%'><tbody><tr>"+tableHeaders+"</tr><tr>\
        "+ troopInputs +"</tr>\
        "+distributionRowsCombined+"<tr>"+ totalRow + "<td style='white-space: nowrap'>0 <span class='icon header res'></span></td><td>0</td></tr></tbody></table></td></table></div>";

    $("#content_value")[0].appendChild(frame); // Append the content to the frame
    levelChange();
}

function saveUnits(){ // Save current user input in localStorage refered to as "oo_units"
    $("span[title='Save current input']")[0].setAttribute("style", "cursor:progress");
    var units = "",
        unitInputs = $(".unitsInput", "#organizer_table");
    for(var i = 0; i < unitInputs.length; i++){
        units += unitInputs[i].name + ":" + unitInputs[i].value;
        if(i != unitInputs.length-1) units += ",";
    }
    localStorage.setItem("oo_units", units);
    setTimeout(function(){$("span[title='Save current input']")[0].setAttribute("style", "cursor:pointer")},100);
}

function getStoredUnits(){ // Get stored units saved from saveUnits() function in localStorage
    var units = localStorage.getItem("oo_units");
    if(units == null) units = Array.apply(null, Array(10)).map(function (x, i) { return ""; }); // If non-existing, return "" as input
    else{
        units = units.split(",");
        for(var i = 0; i < units.length; i++) units[i] = units[i].split(":")[1];
    }
    return units;
}

function distributeClick(){ // Function to run when "distribute" is clicked, initializes the calculations
    changeButton(); // Initialize loading gif and btn-disabled class during calculation
    resetGlobals();
    if($("button[class='btn'][title='Fill']", $("#organizer_table")).length == 0){
        changeButton();
        return 0
    }
    setTimeout(function(){initializeCalc()}, 50); // Allow everything to properly load and reset before initializing calculation
}

function fillScavInputs(lvl){ //Fill scavenger inputs from distribution
    try{ //Will result in error if a "btn-disabled" is clicked
        var dataRow = $(".btn", $(".command-row")).parent().parent()[lvl].children,
        inputFields = $("input", $(".candidate-squad-widget")[0]);
        for(var i = 0; i < dataRow.length-4; i++){
            inputFields[i].value = dataRow[i+2].innerHTML;
            $("input[name='"+inputFields[i].name+"']", $(".candidate-squad-widget")[0]).change();
        }
    }
    catch(err){return;}
}

function initializeCalc(){ // Initialize calculation. Get maximum level and global carry capacity used in getDistributions()
    maxLevel = 4 - $(".btn-disabled", $(".command-row")).length;
    globalCarryCap = getCarryCap();
    calcCheckInterval = setInterval(initializeGetDistribution, 5); // Initialize next step in calculation
}

function initializeGetDistribution(){ // Function to control the calculation. If it's not finished, continue calculation. If finished proceed.
    if(!calculating){
        if(ccDistribution != 0){
            clearInterval(calcCheckInterval);
            initializeUnitDistribution(); // Continue program if calculation is finished
            return;
        }
        else{
            $("#loading_bar")[0].innerText = ".".repeat((Math.round(cc/globalCarryCap * 17))); // Update the progress through loading bar
            getDistributions(); // Begin or continue calculation. Will be runned repeatedly for big calculations
            return;
        }
    }
}

function initializeUnitDistribution(){ // Gather calculated data and display them through inputResults(), and complete the calculation step
    var unitsToInput = getUnitDistribution(ccDistribution[0]), // Get unit distributions for already calculated carry capacity distribution ccDistribution from getDistributions()
        totalRph = 0,
        rphPerLvl = [],
        unitSum = [],
        levels;
    for(var i = 0; i < ccDistribution[0].length; i++){
        ccDistribution[0][i] = 0;
        for(var j = 0; j < unitsToInput[i].length; j++){ccDistribution[0][i] += unitsToInput[i][j] * unitCc[$(".unitsInput", $("#organizer_table"))[j].name];}
        if($("input[name='premium_select']")[availableLevels[i]].checked) ccDistribution[0][i] *= lootConstants[levelNames[i]]["SS"]["loot_factor"];
        rphPerLvl.push(Math.round(calcResPerHour(ccDistribution[0][i], availableLevels[i], $("input[name='premium_select']")[availableLevels[i]].checked)));
        totalRph += rphPerLvl[i];
    }
    for(var i = 0; i < unitsToInput[0].length; i++){
        unitSum.push([0]);
        for(var j = 0; j < unitsToInput.length; j++) unitSum[i] = Number(unitSum[i]) + Number(unitsToInput[j][i]);
    }
    //Calculation is finished. Display results and end program
    inputResults(unitsToInput, ccDistribution[0], rphPerLvl, globalCarryCap, totalRph, unitSum);
    resetGlobals();
    changeButton();
}

function changeButton(){ // Update button to describe the state of the program (running / ready)
    var button = $("button[name='distribute']")[0];
    if(button.innerText == "Distribute"){
        button.innerHTML = button.innerHTML.replace("Distribute", "");
        button.children[1].setAttribute("style", "position:relative;bottom:4px");
        button.setAttribute("class", "btn btn-disabled");
        button.setAttribute("onclick", "cancelCalc()");
    }
    else{
        button.children[1].setAttribute("style", "display:none");
        button.innerHTML=button.innerHTML.replace("", "Distribute");
        button.setAttribute("class", "btn");
        button.setAttribute("onclick", "distributeClick()");
    }
}

function cancelCalc(){ // Function to cancel calculation. Usefull for lengthy calculations
    changeButton();
    resetGlobals();
    throw new Error("Calculation canceled!");
}

function inputResults(unitsToInput, ccDistribution, rphPerLvl, carryCap, totalRph, unitSum){ //Display results from distribution in table
    var unitRows = $("button[class='btn']", $(".command-row")).parent().parent(),
        totalRow = $("tr", "#organizer_table")[$("tr", "#organizer_table").length-1];
    for(var i = 0; i < unitRows.length; i++){
        for(var j = 0; j < unitRows[0].children.length-3; j++){
            unitRows[i].children[j+2].innerHTML = unitsToInput[i][j]
        }
        unitRows[i].children[unitRows[i].children.length-2].innerHTML = formatNumber(ccDistribution[i]) + " <span class='icon header res'></span>";
        unitRows[i].children[unitRows[i].children.length-1].innerHTML = formatNumber(rphPerLvl[i]);
    }
    for(var i = 2; i < totalRow.children.length - 2; i++){
        totalRow.children[i].innerHTML = unitSum[i-2];
    }
    totalRow.children[totalRow.children.length-2].innerHTML = formatNumber(carryCap) + " <span class='icon header res'></span>";
    totalRow.children[totalRow.children.length-1].innerHTML = formatNumber(totalRph);
}

function formatNumber(res){ //Format numbers: "10.000.000"
    return res.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function getUnitDistribution(ccDistribution){ //Calculate how units should be distributed given a carry capacity distribution
    var unitInputs = $(".unitsInput", $("#organizer_table")),
        ccFraction = 1,
        carryCap = 0
        unitValue = 0,
        unitDistribution = [],
        unitSum = [];
    
    for(var i = 0; i < ccDistribution.length; i++) carryCap += ccDistribution[i];
    for(var i = 0; i < ccDistribution.length; i++){ // Get unit distributions
        ccFraction = ccDistribution[i] / carryCap;
        unitDistribution.push([]);
        for(var j = 0; j < unitInputs.length; j++){
            if(i == 0) unitSum.push(0);
            unitValue = Number(unitInputs[j].value);
            unitDistribution[i].push(Math.floor(unitValue * ccFraction));
            unitSum[j] += Math.floor(unitValue * ccFraction);
        }
    }

    for(var i = 0; i < unitSum.length; i++){ // Fill all unassigned troop to the highest level and downwards
        for(var j = 0, count = unitSum[i]; j < unitInputs[i].value - count; j++){
            unitSum[i] ++;
            unitDistribution[ccDistribution.length - 1 - (j % (ccDistribution.length))][i]++;
        }
    }
    return unitDistribution;
}

function getDistributions(){ //Get distribution of carry capacities
    calculating = true;
    if(cc == 0){
        carryCapPerLvl = Array.apply(null, Array(maxLevel)).map(function (x, i) { return 0; });
        for(var i = 0; i < $("button[class='btn']", $(".command-row")).length; i++) availableLevels.push($("button[class='btn']", $(".command-row"))[i].innerHTML.split(" ")[1].split("<")[0]-1);
    } 

    var rphChange = Array.apply(null, Array(maxLevel)).map(function (x, i) { return 0; }),
        distributionLvl = 0,
        loopCount = 0;

    while(cc <= globalCarryCap){
        for(var i = 0; i < maxLevel; i++) rphChange[i] = calcDvResPerHour(carryCapPerLvl[i], availableLevels[i], $("input[name='premium_select']")[availableLevels[i]].checked);
        distributionLvl = rphChange.indexOf(Math.max(...rphChange));
        carryCapPerLvl[distributionLvl] = carryCapPerLvl[distributionLvl] + carryCapPerUnit;

        loopCount++;
        cc += carryCapPerUnit;
        if(loopCount > loopLim){
            calculating = false;
            return;
        }
    }
    calculating = false;
    ccDistribution = [carryCapPerLvl, getRphTotal(carryCapPerLvl)];
    return;
}

function getCarryCap(){ //Get total carry capacity from unit inputs
    var unitInputs = $(".unitsInput", $("#organizer_table")),
        carryCap = 0;
    for (var i = 0; i < unitInputs.length; i++) carryCap += (unitInputs[i].value == "") ? 0 : Number(unitInputs[i].value * unitCc[unitInputs[i].name]);
    return carryCap;
}

function levelChange(){ //Function to run when levels change, mark unwanted rows grey
    var level = $("select[name='levels']")[0].value,
        checked = [],
        availableLevels = getAvailableLevels();
    for(var i = 0; i < 4; i++) availableLevels[i] ? checked.push("checked") : checked.push("") ;
    for(var i = 0; i < 4; i++){
        i < level ? $(".command-row")[i].setAttribute("class", "command-row") : $(".command-row")[i].setAttribute("class", "command-row grey");
        i < level ? $((".btn") , $(".command-row"))[i].setAttribute("class", "btn") : $((".btn") , $(".command-row"))[i].setAttribute("class", "btn btn-disabled");
        if(level == 5){
            if($("input[onchange*='checkboxChange']", $(".command-row")[i])[0] == undefined){
                if(i >= maxLevel) checked.push("");
                
                $(".command-row")[i].children[0].innerHTML = "<input type='checkbox' style='width:15px' onchange='checkboxChange("+i+")' " + checked[i] + ">" +  $(".command-row")[i].children[0].innerHTML
                if(checked[i] == "") checkboxChange(i);
            }
        }
        else{
            if($("input[onchange*='checkboxChange']", $(".command-row")[i])[0] != undefined){
                $(".command-row")[i].children[0].innerHTML = $(".command-row")[i].children[0].children[1].outerHTML;
            }
        }
    }
}

function checkboxChange(lvl){ // Update row if checkbox changes state
    $(".command-row")[lvl].children[0].children[0].checked ? $(".command-row")[lvl].setAttribute("class", "command-row") : $(".command-row")[lvl].setAttribute("class", "command-row grey");
    $(".command-row")[lvl].children[0].children[0].checked ? $((".btn") , $(".command-row"))[lvl].setAttribute("class", "btn") : $((".btn") , $(".command-row"))[lvl].setAttribute("class", "btn btn-disabled");
}

function inputAllTroops(){ //Input all available units in the village to the organizer-input
    var inputs = $(".unitsInput", "#organizer_table"),
        maxInputs = $(".units-entry-all", "#organizer_table"),
        allFull = true;
    for(var i = 0; i < inputs.length; i++){ // If all inputs are already correct, set all inputs to zero in next loop: allFull ? ...
        if(inputs[i].value == "") inputs[i].value = 0;
        if(inputs[i].value != maxInputs[i].innerHTML.split("(")[1].split(")")[0]) allFull = false;
    }
    for(var i = 0; i < inputs.length; i++){ // Set the values of each input
        valueToInput = inputs[i].value = $(".units-entry-all", "#organizer_table")[i].innerHTML.split("(")[1].split(")")[0];
        allFull ? inputs[i].value = "" : (valueToInput == 0 ? inputs[i].value="" : inputs[i].value = valueToInput);
    }
}

function fillUnit(unit){ //Fill or remove all units of a given type
    var unitsToInput = $("a[onclick=\"fillUnit('"+unit+"')\"]")[0].innerHTML.split("(")[1].split(")")[0];
    if($("input[name="+ unit +"]")[1].value == unitsToInput || unitsToInput == 0) unitsToInput = "";
    $("input[name="+ unit +"]")[1].value = unitsToInput;
}

function premiumSelectAll(){
    for(var i = 0; i < $("input[name='premium_select']").length; i++) $("input[name='premium_select']")[i].checked = $("input[onclick='premiumSelectAll()']")[0].checked;
}

//----------------------------------
//Run the program by creating user interface
//----------------------------------

setupUi();
