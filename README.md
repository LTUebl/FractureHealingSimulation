# Bone Fracture Healing & Mechanoregulation Simulator

**Interactive Coupled Lattice Cell-Activity & Poroelastic Mechanoregulation Simulator for Human Tibial Fracture Healing**  
*Developed for **LTU Cellular Mechanobiology (BME 5313 / 6303)** — Dr. Eric G. Meyer, Experimental Biomechanics Laboratory (EBL), Lawrence Technological University.*  
*Based on **Byrne, D. P., Lacroix, D., & Prendergast, P. J. (2011)**, "Simulation of Fracture Healing in the Tibia: Mechanoregulation of Cell Activity Using a Lattice Modeling Approach," **Journal of Orthopaedic Research**, 29(10), 1496–1503, and **Perier-Metz, C., Duda, G. N., & Checa, S. (2020)**, "Mechano-Biological Computer Model of Scaffold-Supported Bone Regeneration: Effect of Bone Graft and Scaffold Structure on Large Bone Defect Tissue Patterning," **Frontiers in Bioengineering and Biotechnology**, 8:585799.*

🌐 **Live Web Application**: [https://ltuebl.github.io/FractureHealingSimulation/](https://ltuebl.github.io/FractureHealingSimulation/)

---

## Overview

During bone fracture healing, mechanical stability and biological activity work together to guide tissue differentiation from initial granulation tissue through fibrocartilage, woven bone, and lamellar cortical remodeling. This simulator lets students and researchers explore the coupled **mechanoregulation + cellular lattice** framework in real time:

* **External Loading & Rehab Schedule:** Adjust peak physiological gait loading ($\times$ 80 kg BW, adapted from Duda et al. 45% gait cycle) and weight-bearing schedule (Byrne 2011 cautious ramp, immediate full weight-bearing, delayed loading, or protected load).
* **Fracture Gap & Stability:** Vary osteotomy gap width ($1.0\text{–}25.0\text{ mm}$) and initial callus index ($1.0\times\text{–}1.8\times$) to observe optimal healing vs. hypertrophic or critical-size non-union.
* **Fixation Type & Stiffness:** Compare **Unilateral External Fixator** (with automatic removal at the $15\text{ Nm/deg}$ clinical union threshold), **Medial Locking Compression Plate** (showing medial strain shielding), **Intramedullary Nail**, and **Cast / Functional Brace** across $10\%\text{–}300\%$ stiffness.
* **Callus MSC Activity & Bone Graft Material:** Control endogenous MSC proliferation/migration/differentiation ($0.2\times\text{–}2.0\times$) and evaluate **Autologous Bone Graft**, **3D Osteoconductive Scaffold** (surface-guided ECM deposition), **BMP-2 / Osteoinductive Gel**, and **MSC-Seeded Bioactive Scaffold** in bridging critical defects.

---

## Biophysical Mechanoregulation Model

At every callus lattice element, the local biophysical stimulus $S$ combines octahedral shear strain $\gamma$ and interstitial fluid velocity $v$:

$$S = \frac{\gamma}{a} + \frac{v}{b}, \qquad a = 0.0375, \quad b = 3\ \mu\text{m/s}$$

* **$S \le 0.01$:** Bone Resorption (Osteoclasts)
* **$0.01 < S \le 0.53$:** Mature Bone (Osteoblasts $\to$ Lamellar / Cortical remodeling)
* **$0.53 < S \le 1.00$:** Immature Woven Bone (Osteoblasts)
* **$1.00 < S \le 3.00$:** Cartilage (Chondrocytes)
* **$S > 3.00$:** Fibrous Connective Tissue (Motile Fibroblasts)

---

## Running Locally

### Option A: Standalone Edition (No Server Required)
Open `index_standalone.html` directly in any modern web browser.

### Option B: Local Development Server
```bash
python -m http.server 8000
```
Navigate to `http://localhost:8000/index.html`.

### Rebuilding `index_standalone.html`
```bash
node bundle.mjs
```

---

## References
1. **Byrne, D. P., Lacroix, D., & Prendergast, P. J.** (2011). *J. Orthop. Res.* 29(10):1496–1503. [doi:10.1002/jor.21362](https://doi.org/10.1002/jor.21362)
2. **Perier-Metz, C., Duda, G. N., & Checa, S.** (2020). *Front. Bioeng. Biotechnol.* 8:585799. [doi:10.3389/fbioe.2020.585799](https://doi.org/10.3389/fbioe.2020.585799)
3. **Kendall, J. J., et al.** (2023). *Front. Bioeng. Biotechnol.* 11:1289127. [doi:10.3389/fbioe.2023.1289127](https://doi.org/10.3389/fbioe.2023.1289127)
4. **Richardson, J. B., et al.** (1994). *J. Bone Joint Surg. Br.* 76-B:389–394.

&copy; 2026 Lawrence Technological University &middot; Experimental Biomechanics Laboratory (EBL) &middot; Dr. Eric G. Meyer
