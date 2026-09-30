import math

def _betacf(a, b, x, maxit=200, eps=3e-14):
    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < 1e-30:
        d = 1e-30
    d = 1.0 / d
    h = d
    for m in range(1, maxit + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < 1e-30:
            d = 1e-30
        c = 1.0 + aa / c
        if abs(c) < 1e-30:
            c = 1e-30
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < 1e-30:
            d = 1e-30
        c = 1.0 + aa / c
        if abs(c) < 1e-30:
            c = 1e-30
        d = 1.0 / d
        de = d * c
        h *= de
        if abs(de - 1.0) < eps:
            break
    return h

def betai(a, b, x):
    """Regularized incomplete beta function I_x(a,b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    bt = math.exp(lbeta + a * math.log(x) + b * math.log(1.0 - x))
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    else:
        return 1.0 - bt * _betacf(b, a, 1.0 - x) / b

def t_dist_two_tailed_pvalue(t, df):
    """Two-tailed p-value for Student's t statistic with df degrees of freedom."""
    t = abs(t)
    x = df / (df + t * t)
    return betai(df / 2.0, 0.5, x)

if __name__ == "__main__":
    # Validation against well-known textbook critical values:
    # df=7, two-tailed alpha=0.05 critical t = 2.365 -> p should be ~0.05
    print("df=7, t=2.365 ->", t_dist_two_tailed_pvalue(2.365, 7), "(expect ~0.05)")
    # df=7, two-tailed alpha=0.01 critical t = 3.499 -> p should be ~0.01
    print("df=7, t=3.499 ->", t_dist_two_tailed_pvalue(3.499, 7), "(expect ~0.01)")
    # t=0 -> p=1
    print("df=7, t=0 ->", t_dist_two_tailed_pvalue(0.0, 7), "(expect 1.0)")
    # df=20, alpha=0.05 critical t=2.086
    print("df=20, t=2.086 ->", t_dist_two_tailed_pvalue(2.086, 20), "(expect ~0.05)")
