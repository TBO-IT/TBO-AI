import { analysisRegistry, analysisSelector } from "../ai/analysis/bootstrap.js";
import { hospitalityOntology } from "../ai/ontology/bootstrap.js";
import { CapabilityType } from "../ai/ontology/types.js";

function divider(title: string) {
    console.log("\n" + "=".repeat(60));
    console.log(title);
    console.log("=".repeat(60));
}



async function run() {
    divider("ONTOLOGY TEST");

    console.log(
        "Concepts:",
        hospitalityOntology.getAllConcepts().length
    );

    console.log(
        "Metrics:",
        hospitalityOntology.getAllMetrics().length
    );

    console.log(
        "Capabilities:",
        hospitalityOntology.getAllCapabilities().length
    );

    divider("ANALYSIS REGISTRY TEST");

    console.log(
        "Registered Analyses:",
        analysisRegistry.getAll().length
    );

    console.log(
        "\nPerformance Analyses:"
    );

    console.dir(
        analysisRegistry.getByCapability(
            CapabilityType.PERFORMANCE
        ),
        { depth: null }
    );

    divider("LOOKUP TEST");

    const performance = analysisRegistry.get(
        "performance-analysis"
    );

    console.log(performance);

    divider("DONE");
}

run().catch(console.error);