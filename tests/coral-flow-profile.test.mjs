import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareCoralFlowData } from "../src/lib/profiles/coral-flow.mjs";

const SAMPLE_DOCS = [
    {
        path: "/home/example/Angel materials - 16.04.25.docx",
        label: "Angel materials - 16.04.25.docx",
    },
];

test("prepareCoralFlowData normalises job and materials for Persisto operations", () => {
    const payload = {
        job: {
            job_id: "JOB-2416",
            job_name: "Angel Site Materials",
            client_name: "Angel Holdings",
        },
        materials: [
            {
                name: "Angel wing brackets",
                quantity: "12",
                unit: "pcs",
                notes: "High tensile",
            },
            {
                name: "Celestial resin",
                quantity: "4",
                unit: "kg",
            },
        ],
        summary: "Two material lines extracted from Angel order.",
    };

    const result = prepareCoralFlowData(payload, { documents: SAMPLE_DOCS });
    assert.equal(result.job.job_id, "JOB-2416");
    assert.equal(result.materials.length, 2);
    assert.ok(result.materials[0].material_id.includes("job-2416"));
    assert.equal(result.operations.length, 3); // 1 job + 2 materials
    assert.equal(result.operations[0].method, "createJob");
    assert.equal(result.operations[1].method, "createMaterial");
    assert.equal(result.operations[2].method, "createMaterial");
    assert.ok(Array.isArray(result.warnings));
});
